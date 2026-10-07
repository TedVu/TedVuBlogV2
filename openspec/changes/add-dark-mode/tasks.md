# Tasks

The project has no test framework. Each task is verified with `npm run build` plus the observable check named in it, using `npm run dev` in a browser with DevTools.

Verified during apply with `npm run build`, grep audits, and headless Chrome driven over CDP against `astro preview`. That run covered 37 behavior checks (first-frame theme, frames sampled during client navigation, emulated OS changes, throwing storage, toggle and keyboard, the accessibility tree), plus screenshots of both themes at 1100px, 375px and 320px compared with a `HEAD` build.

## 1. Token layer (light theme only, no visual change)

- [x] 1.1 In `src/styles/global.css`, define the light-theme tokens from design.md Decision 1 on `:root` along with `color-scheme: light`. Replace every color literal in the file (body, headings, `small`, selection, code/pre, table borders, blockquote, hr) with tokens, and fold `--gray-light` into `--color-surface`. Verify with `grep -nE "rgba?\(|#[0-9a-fA-F]{3,8}" src/styles/global.css`: matches should appear only inside the token definitions, and `npm run build` should pass.
- [x] 1.2 Tokenize `Header.astro` and `Footer.astro`. Replace `var(--black)` and `rgb(var(--gray|--gray-dark))` with semantic tokens, remove the never-rendered `--gray-gradient` background, and keep the LinkedIn `#0077B7` fill. Verify in the browser that header and footer look the same as before.
- [x] 1.3 Tokenize `layouts/BlogPost.astro` and `pages/viet/index.astro`. Replace `rgb(var(--gray|--gray-dark|--black|--accent))` with `var(--token)` and `var(--box-shadow)` with `var(--shadow)`. Verify a blog post page and `/about` look the same as before, and that DevTools shows no "invalid property value" on those rules.
- [x] 1.4 Tokenize `BlogSearch.astro`. The input border uses `--color-border-strong`, its background `--color-surface`, the focus border `--accent`, and `time` uses `--color-muted`. Verify `/blog` search still filters and looks unchanged.
- [x] 1.5 Audit: run `grep -rnE "var\(--(black|gray|gray-dark|gray-light|gray-gradient|box-shadow)\)|rgb\(var\(" src` and confirm it returns nothing. Then run `grep -rnE "rgba?\(|#[0-9a-fA-F]{3,8}\b|\bgrey\b" src --include=*.astro` and confirm only the LinkedIn fill and SVG path data remain.

## 2. Dark theme values

- [x] 2.1 Add the `:root[data-theme="dark"]` block to `global.css` with the navy values from design.md and `color-scheme: dark`. Verify by setting `data-theme="dark"` on `<html>` in DevTools: on the home, blog index, a blog post, `/about` and `/top-100`, no element keeps a light background or shows dark-on-dark text.
- [x] 2.2 Check contrast for `--color-text`, `--color-heading`, `--color-muted` and `--accent` against `--color-bg` in both themes, using the DevTools contrast checker or webaim.org/resources/contrastchecker. Adjust dark values until body and link text reach at least 4.5:1, and update the table in design.md if values change.

## 3. Theme resolver (no flash)

- [x] 3.1 Add the `<script is:inline>` resolver to `BaseHead.astro` as in design.md Decision 3: `resolve()` (saved value, then `matchMedia`, then light, with storage wrapped in try/catch) and `apply()`, run immediately. Verify that with OS set to dark (DevTools > Rendering > emulate `prefers-color-scheme: dark`) and empty storage, a hard reload of any page paints dark with no light frame. A Performance panel screenshot strip is a good way to confirm.
- [x] 3.2 Add the `astro:before-swap` listener that sets `data-theme` on `event.newDocument.documentElement`, plus an `astro:after-swap` re-apply as a fallback, guarded by a `window` flag against double registration. Verify that navigating Home > Blog > a post > About in dark mode shows no light frame and `<html data-theme="dark">` stays set.
- [x] 3.3 Add the `matchMedia` change listener, which applies only when no theme is saved. Verify that with empty storage, toggling the emulated OS scheme in DevTools switches the open page live, and that after `localStorage.theme = "light"` it no longer does.
- [x] 3.4 Verify storage failure: in a private window, or after overriding `localStorage.getItem` to throw in the console before reload, the page still loads in the OS theme and the console shows no errors.

## 4. Theme toggle

- [x] 4.1 Create `src/components/ThemeToggle.astro` as in design.md Decision 4: a `<button type="button" aria-label="Toggle dark mode" aria-pressed>` with inline sun and moon SVGs, shown or hidden by `[data-theme]` CSS and colored with `currentColor`. Its bundled script flips `data-theme`, saves to `localStorage` in try/catch, and syncs `aria-pressed` on `astro:page-load`. Verify that clicking switches the theme instantly and sets `localStorage.theme`.
- [x] 4.2 Mount `<ThemeToggle />` at the end of the nav row in `Header.astro`, styled to match the nav links. Verify it appears on every page type and doesn't break the header layout at 375px width.
- [x] 4.3 Verify persistence and navigation: switch to dark, navigate through 3 pages with `ClientRouter`, then open the site in a new tab. Every page renders dark and the toggle shows the moon or pressed state. Repeat with light while the OS is set to dark.
- [x] 4.4 Verify accessibility: Tab reaches the toggle, Enter and Space switch the theme, the focus ring is visible in both themes, and the screen reader or the DevTools Accessibility pane reports "Toggle dark mode, toggle button, pressed or not pressed".

## 5. Integration check

- [x] 5.1 Run `npm run build && npm run preview` and repeat the 3.1, 3.2 and 4.3 checks against the production build, since inline-script ordering and the bundled toggle script can behave differently from dev. Confirm the light theme is visually unchanged from `main` on home, blog index, and a post.
