# Proposal

## Why

The site only has a light theme: a sky-blue background with dark text. Readers who browse in dark mode, or at night, get a bright page with no way to change it. The colors are also hard to retheme. Most are hardcoded literals, and several components reference CSS variables that are never defined (`--black`, `--gray`, `--gray-dark`, `--gray-gradient`, `--box-shadow`). Those are leftovers from the Astro blog template that silently fall back to inherited values.

## What Changes

- Add a dark theme with a navy palette. It keeps the site's blue identity instead of switching to a neutral grey.
- Add a two-state theme toggle (light / dark) to the site header.
- On a first visit, the theme follows the reader's OS preference (`prefers-color-scheme`). Once the reader clicks the toggle, their choice is saved in `localStorage` and wins on later visits.
- While no choice is saved, the site follows changes to the OS preference live.
- The theme is applied before first paint, and again after every Astro `ClientRouter` page swap, so pages never flash the wrong theme.
- Move every color in `global.css` and in component and page styles to a single set of semantic CSS custom properties. Replace the undefined template variables with real tokens.
- Set `color-scheme` so native UI (scrollbars, the search input) matches the active theme.
- No visual change to the existing light theme beyond fixing the undefined variables.

## Capabilities

### New Capabilities
- `site-theme`: light and dark color themes, the toggle, the initial-theme rule (saved choice, then OS preference), persistence, and applying the theme with no flash across full loads and client-side navigation.

### Modified Capabilities
<!-- None: no existing specs in openspec/specs/. -->

## Impact

- **Styles:** `src/styles/global.css` (token definitions, dark overrides, `color-scheme`).
- **Head:** `src/components/BaseHead.astro` (inline theme script). Every page includes it, directly or through `layouts/BlogPost.astro`, so it covers the whole site.
- **New component:** `src/components/ThemeToggle.astro`.
- **Components and pages that switch to tokens:** `Header.astro`, `Footer.astro`, `BlogSearch.astro`, `layouts/BlogPost.astro`, `pages/viet/index.astro`.
- **Dependencies:** none added.
- **Content:** Contentful post images are not changed. Images with transparency or dark line art may look poor on navy. This is a known risk, deferred until such an image turns up.
