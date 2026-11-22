# Theme

The site has a light theme and a dark theme. A sun/moon button in the header switches between them instantly and remembers the choice. Expected behavior comes from `openspec/changes/add-dark-mode/specs/` (site-theme). Initial theme: the saved choice, else the OS preference, else light. In both themes text meets 4.5:1 contrast.

## Sub-features

- `theme-initial`: with no saved choice, an OS light preference renders light and an OS dark preference renders dark.
- `theme-toggle`: `Toggle dark mode` flips the theme without a reload, updates `aria-pressed`, saves `localStorage.theme`, and works with the keyboard (Enter).
- `theme-persist`: the chosen theme survives header navigation and a full reload.
- `theme-saved-wins`: a saved `light` beats an OS dark preference.
- `theme-contrast`: post-page widgets (the like prompt) are readable in dark mode.

## How to get to it (user POV)

- The theme button sits at the right end of the header nav on every page.
- First visit: the theme comes from the OS setting.

## Driving it with control.mjs

Preconditions:

- Instance is up and `doctor` reports `DOCTOR OK`.
- Fresh profiles with `colorScheme: "light"` or `"dark"` emulate the OS preference.

- **Run it.** `node .claude/skills/verify-tedvublog/scripts/control.mjs journey theme`.
- **Initial.** On `/` with OS light and empty storage, `document.documentElement.dataset.theme` should be `light`. With OS dark it should be `dark`.
- **Toggle.** Clicking `Toggle dark mode` flips `data-theme` with no reload (a `window` marker survives), `aria-pressed` matches dark, and `localStorage.theme` holds the new value. Enter on the focused button flips it back.
- **Persist.** Choose dark, click the `Blog` header link, and it is still dark. Reload, and it is still dark.
- **Saved wins.** In an OS dark profile, set `localStorage.theme = "light"` and reload. The page is light.
- **Contrast.** In dark on a post, `.post-actions.bottom .prompt` should be at least 4.5:1 against the body background.
- **Proof.** `01-initial-os-light`, `02-after-toggle`, and `03-post-dark`, plus `steps.json`.

## Gotchas

- **Known failure, `theme-initial` (as of 9c89a6e):** `BaseHead.astro` resolves `getStoredTheme() ?? "dark"`, ignoring the OS preference, so OS light renders dark. That contradicts the add-dark-mode spec, proposal, and tasks 3.1. Either the code or the spec needs to change. Don't edit the journey to match the code until the spec says dark-by-default.
- **Known failure, `theme-contrast` (as of 9c89a6e):** `LikeButton.vue` hardcodes light-theme colors (`rgba(34, 41, 57, 0.75)` text, `#fff` button), so the bottom prompt measures 1.23:1 in dark. `TopLiked.vue` and `ActiveReaders.vue` hardcode the same muted color.
- The SSR HTML has `data-theme="dark"` hard-coded. The inline script in `BaseHead.astro` overwrites it before paint, so assert after `goto`, not on raw HTML.
- The `Blog` header link goes to `/blog` (no slash). Match the URL by pathname.
