# Share

Every post shows a row of share buttons under the title and at the end. Facebook, X, and WhatsApp open their share pages in a new tab with the post's canonical `https://tedvu.com/...` URL. `Copy link` puts that URL on the clipboard and confirms. `Share via…` opens the OS share sheet where the browser supports it.

## Sub-features

- `share-links`: each social link's `href` carries the URL-encoded canonical URL (and the title for X and WhatsApp), with `target="_blank"` and `rel="noopener noreferrer"`.
- `share-popup`: clicking a social link opens a popup at that URL.
- `share-copy`: `Copy link` writes the canonical URL to the clipboard, shows `Copied`, announces `Link copied`, and clears after about 2 s.
- `share-copy-fallback`: with no clipboard access, a `window.prompt` shows the URL instead.
- `share-native`: `Share via…` is visible only when `navigator.share` exists.

## How to get to it (user POV)

- Open a post. Use the button row under the title, or the one at the end of the post.

## Driving it with control.mjs

Preconditions:

- Instance is up and `doctor` reports `DOCTOR OK`.
- The browser context grants `clipboard-read` and `clipboard-write` (the journey does this).

- **Run it.** `node .claude/skills/verify-tedvublog/scripts/control.mjs journey share`. The run ends with `PASSED: share`.
- **Links.** For `Share on Facebook`, `Share on X`, and `Share on WhatsApp` in `.share.top`, the `href` equals the expected intent URL built from `https://tedvu.com/blog/<slug>/` and the title.
- **Popup.** Clicking `Share on X` opens a popup whose URL is the X intent URL. Requests to facebook.com, x.com, and wa.me are fulfilled locally, so nothing real loads.
- **Copy.** Clicking `Copy link` puts the canonical URL on the clipboard, shows `Copied`, and sets `[data-share-status]` to `Link copied`. After 2.3 s `Copied` is hidden.
- **Native.** `Share via…` is visible exactly when `"share" in navigator`. Desktop Chrome on Windows has it.
- **Proof.** `01-copied.png`/`.aria.yml` and `steps.json` with each href.

## Gotchas

- `getByText("Copied")` also matches the hidden `Link copied` live region. Use `{ exact: true }`.
- The canonical URL always uses `https://tedvu.com` (`site` in `astro.config.mjs`), not the local dev URL.
- `share-copy-fallback` isn't scripted. To drive it, deny clipboard permissions and handle the `dialog` event. The prompt blocks until it's dismissed.
- Opening the real `Share via…` sheet blocks headless Chrome. Assert visibility only, unless you stub `navigator.share`.
