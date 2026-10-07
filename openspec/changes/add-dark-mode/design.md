# Design

## Context

- Astro 5 static site. Every page includes `BaseHead.astro` in `<head>`: `index` and `blog/index` directly, and all other pages through `layouts/BlogPost.astro`. `BaseHead` imports `global.css` and renders `<ClientRouter />`, so internal navigation swaps the document on the client instead of doing a full load.
- `global.css` holds most colors as literals: body text `rgb(34,41,57)`, background `rgb(189,221,252)`, headings `rgb(15,18,25)`, plus borders, selection and blockquote colors. `:root` defines only `--accent`, `--accent-dark`, `--gray-light`, `--shadow` and `--radius`.
- Component styles reference variables that are never defined: `--black` (Header, viet/index), `--gray` and `--gray-dark` (Footer, BlogPost, viet/index), `--gray-gradient` (Footer) and `--box-shadow` (BlogPost, viet/index). viet/index also uses `rgb(var(--accent))`, which is invalid because `--accent` is a hex value. These declarations are dropped today, so the elements inherit their color.
- BlogSearch hardcodes `rgba(0,0,0,.15)`, `rgba(255,255,255,.6)`, `#2337ff` and `grey`.
- Requirements: see `specs/site-theme/spec.md`.

## Goals / Non-Goals

**Goals:**
- One semantic token layer, where the dark theme is purely a set of value overrides.
- The theme is resolved by a single small inline script with no build-time or runtime dependency.
- Remove every undefined-variable reference while doing the tokenization.

**Non-Goals:**
- A "system" third toggle state.
- Theming Contentful post images or embedded iframes.
- Syntax-highlighting themes for code blocks. There is no highlighter configured, and `pre` uses only a background color.
- Changing the light theme's design.

## Decisions

### 1. Semantic tokens on `:root`, overridden by `:root[data-theme="dark"]`
Define all colors as tokens in `global.css`:

| token | light | dark (navy) |
|---|---|---|
| `--color-bg` | `rgb(189 221 252)` | `rgb(15 23 42)` |
| `--color-surface` (code, pre) | `rgb(229 233 240)` | `rgb(30 41 59)` |
| `--color-input-bg` (search input) | `rgb(255 255 255 / .6)` | `rgb(30 41 59)` |
| `--color-text` | `rgb(34 41 57)` | `rgb(214 226 240)` |
| `--color-heading` | `rgb(15 18 25)` | `rgb(241 245 250)` |
| `--color-muted` (dates, footer, small) | `rgb(34 41 57 / .75)` | `rgb(214 226 240 / .7)` |
| `--color-border` | `rgb(0 0 0 / .08)` | `rgb(255 255 255 / .1)` |
| `--color-border-strong` (hr, input) | `rgb(0 0 0 / .15)` | `rgb(255 255 255 / .18)` |
| `--accent` | `#2337ff` | `#8b9bff` |
| `--accent-dark` (hover) | `#000d8a` | `#b4bfff` |
| `--color-selection` | `rgb(35 55 255 / .18)` | `rgb(139 155 255 / .3)` |
| `--shadow` | existing | `0 6px 18px rgb(0 0 0 / .4)` |

Measured contrast against `--color-bg` (light / dark): text 10.3 / 13.6, heading 13.3 / 16.3, muted 5.3 / 7.2, accent 4.9 / 7.0. Every pair passes 4.5:1, so no values were adjusted. `--color-input-bg` keeps the search input's original translucent white in light mode, which `--color-surface` would have changed.

The undefined template variables are replaced at their call sites, with no aliases. Header nav links (`var(--black)`) use `color: inherit`, because the invalid declaration made them inherit and that reproduces the old look exactly. Elsewhere `--black` becomes `--color-heading`, `--gray` becomes `--color-muted`, `--gray-dark` becomes `--color-text`, `--box-shadow` becomes `--shadow`, and the Footer gradient is removed (it never rendered). Tokens hold full color values, not bare `r, g, b` triplets, so components write `var(--x)` and not `rgb(var(--x))`. `--gray-light` is folded into `--color-surface`.

*Alternatives:* a `prefers-color-scheme` media query with no attribute can't be overridden by a toggle. A `.dark` class works the same as the attribute, but `data-theme` can be read as a value and leaves room for more themes. Keeping the `rgb(var(--triplet))` style was rejected because it's the source of the current invalid declarations.

### 2. `color-scheme` follows the theme
`:root { color-scheme: light }` and `:root[data-theme="dark"] { color-scheme: dark }`. This gives native scrollbars, the `type="search"` clear button and form controls their dark variants for free.

### 3. Inline resolver script in `BaseHead`, with `is:inline`
A short `<script is:inline>` placed before the stylesheet-dependent content in `BaseHead`:
- `resolve()`: wrapped in try/catch, it reads `localStorage.getItem("theme")`. If the value is `"light"` or `"dark"` it is used. Otherwise it falls back to `matchMedia("(prefers-color-scheme: dark)").matches`, then to `"light"`.
- `apply(theme)`: sets `document.documentElement.dataset.theme`.
- It runs once immediately, which blocks the first paint and so prevents a flash on full loads.
- It listens for `astro:before-swap` and copies the **current** page's `data-theme` onto `event.newDocument.documentElement` before the swap. It copies rather than recalculating so that a toggle choice survives navigation even when storage is blocked. `ClientRouter` replaces `<html>` attributes with the incoming document's, so setting the theme on the new document before the swap avoids a light frame. `astro:after-swap` alone could paint one frame first.
- It registers a `matchMedia` change listener that calls `apply(resolve())` only while nothing is saved.

`is:inline` is needed: Astro's bundled scripts are deferred modules that run after paint. Because `ClientRouter` does not re-run inline head scripts already in the page, the `before-swap` listener is registered once and persists across swaps. A guard flag on `window` prevents it from being registered twice if the script does run again.

*Alternatives:* setting the theme in `astro:after-swap` only is simpler, but risks a single light frame. A cookie with server rendering isn't possible because the site is a static build.

### 4. `ThemeToggle.astro` component in the header nav
A `<button type="button">` with `aria-label="Toggle dark mode"` and `aria-pressed` reflecting dark. It holds inline SVG sun and moon icons, and CSS shows the right one from `[data-theme]`, so the icon is correct before any JS runs. Its bundled `<script>` handles the click: it flips `data-theme`, writes `localStorage` inside try/catch, and updates `aria-pressed`. It re-syncs `aria-pressed` on `astro:page-load`, because the header DOM is replaced on each swap. The button uses the event delegation or re-query pattern on `astro:page-load` so it works after navigation.

In the header the button sits at the end of `.social-links`. Nav links are `white-space: nowrap` and the row is `flex-wrap: wrap`, so at 375px everything fits on one row, and at 320px whole items wrap instead of overflowing.

*Alternative:* a Vue island. The Vue integration exists, but hydrating a framework for one button adds JS and a hydration delay, during which the button doesn't respond.

### 5. No animated theme switch
No global color transition. Animating `background-color` on every element causes jank and also animates the initial theme application. Instant switching is acceptable.

## Risks / Trade-offs

- [Contentful images with transparency or dark line art become hard to see on navy] → Out of scope. If one turns up, add a light backing behind images in `.prose`, limited to the dark theme.
- [`localStorage` throws in some privacy modes] → All storage access goes through try/catch. The toggle still works for the session through `data-theme`, but the choice isn't saved.
- [`astro:before-swap` behavior changes in a future Astro version] → The `astro:after-swap` re-apply stays as a fallback, so the worst case is one frame of flash and never the wrong theme.
- [Missing a hardcoded color during tokenization] → Tasks include a grep audit for color literals and `var(--gray|--black|--box-shadow)` before completion.
- [Readers with JS disabled] → No `data-theme` is set, so the site renders the light theme. That is acceptable, and the toggle has no effect.

## Migration Plan

This is a pure front-end change on a static deploy. Rolling back means reverting the commit. A stale `theme` key left in `localStorage` after a rollback is harmless.
