# Likes

A reader can like a post once. The heart button appears under the title and again at the end of the post. Both show the same count and state, and the like survives a reload. The server counts one like per visitor (hashed IP), so a fresh browser on the same network doesn't add another.

## Sub-features

- `likes-initial`: buttons show the stored count. Shows `–` until the count loads.
- `likes-click`: clicking turns the button liked (`You liked this post`) and adds one to the count.
- `likes-sync`: the top and bottom buttons agree. The bottom prompt changes to `Thanks for reading!`.
- `likes-single-post`: one click sends exactly one `POST /api/likes/<section>/<slug>`.
- `likes-persist`: the like is stored in Redis and in `localStorage` (`liked:<postKey>`), and survives a reload.
- `likes-dedupe`: a second profile from the same IP sees the button enabled, but its click doesn't change the count.

## How to get to it (user POV)

- Open any post (`/blog/<slug>/` or `/viet/<slug>/`) and click the heart under the title.
- Scroll to the end of the post and click the heart next to `Enjoyed this post?`.

## Driving it with control.mjs

Preconditions:

- Instance is up and `doctor` reports `DOCTOR OK`.
- The journey resets the fake Redis itself.

- **Run it.** `node .claude/skills/verify-tedvublog/scripts/control.mjs journey likes`. The run ends with `PASSED: likes`.
- **Initial.** Opens the first post from `/blog/`. The top button reads `Like this post` with count `0`.
- **Click.** Clicks the top button. Its name becomes `You liked this post` and the count shows `1`.
- **Sync.** Scrolls to the bottom button. It is liked with count `1`, and `Thanks for reading!` is visible.
- **Side effects.** Exactly one like POST was sent. `redis-after-like.json` has `likes[postKey] = 1` and one member in `likes:voters:<postKey>`. `localStorage["liked:<postKey>"]` is `"1"`.
- **Reload.** After a reload the top button is still liked with count `1`.
- **Dedupe.** A fresh profile sees `1` and an enabled button. Clicking it leaves the count at `1` in both the UI and `redis-after-repeat.json`.
- **Proof.** `01-before`, `02-after-like`, and `03-repeat-voter` `.png`/`.aria.yml`, plus `steps.json`.

## Gotchas

- Every local browser shares `127.0.0.1`, so all profiles hash to one voter. To test two distinct voters, seed a different hash with `redis seed` or drive `POST` from another source address. The UI can't do it locally.
- The bottom button hydrates with `client:visible`. Scroll it into view before asserting on it.
- The fake Redis emulates the `ADD_LIKE_SCRIPT` Lua by name. If `src/lib/likes.ts` changes the script, the fake rejects it (doctor fails) until `fake-upstash.mjs` is updated.
- In dark mode the like button keeps a white pill and dark text, and the `Thanks for reading!` prompt is nearly invisible (contrast 1.23:1). The theme journey reports this.
