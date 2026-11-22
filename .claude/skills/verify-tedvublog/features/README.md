# Ted Vu blog verification map

This directory is the maintained source for verifying the reader-facing behavior of the blog. Read this index before driving the site, then use the matching feature file as the recipe.

## Baseline preconditions

- Launch with `node .claude/skills/verify-tedvublog/scripts/control.mjs up` and wait for `READY http://127.0.0.1:<port>`.
- `control.mjs doctor` prints `DOCTOR OK`, including `likes API bound to the fake, not production`.
- Contentful is reachable and `/blog/` lists at least two posts (needed by `top-liked`).
- The fake Redis starts empty. Journeys that need state reset or seed it themselves.
- Never drive an instance this run did not start.

## Driving conventions

- Every journey starts from a fresh browser profile (`newPage`), so `localStorage` and the HTTP cache are empty.
- Prefer accessible names and the stable handles in `SKILL.md` over CSS position.
- Pick posts with `firstPost(page)` or from `/blog/`. Never hard-code a slug.
- Use `launchBrowser({ presence: true })` only for the presence feature.
- Restore Redis (`redis("reset")`) after seeding when the next journey might read it.

## Proof and skip reporting

- `steps.json` records every check, the git rev, and the base URL.
- UI proof is a screenshot plus an ARIA snapshot at the key states.
- A mutation is proved by a second, read-only view: a Redis dump, `localStorage`, or the clipboard.
- Report an unmet precondition as a failed check that names it. Don't report a skipped entry point as verified through another one.

## Feature entry contract

Each feature file has an H1, a one-paragraph description, then four H2s in order: `Sub-features`, `How to get to it (user POV)`, `Driving it with control.mjs`, `Gotchas`.

## Features

- [Likes](./likes.md): like a post from the top or bottom button, synced, deduplicated per visitor, persisted.
- [Share](./share.md): Facebook, X, and WhatsApp links, copy link, and the native share sheet.
- [Theme](./theme.md): initial theme, the header toggle, persistence, and dark-mode readability.
- [Search](./search.md): filter `/blog/` posts as you type, the empty state, and clearing.
- [Most liked](./top-liked.md): the home page list ranked by likes.
- [Active readers](./presence.md): the live header counter, leaving, and ignoring bots.
