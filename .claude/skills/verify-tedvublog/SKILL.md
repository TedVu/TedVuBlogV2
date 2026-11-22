---
name: verify-tedvublog
description: Drive Ted Vu's Astro blog (tedvu.com) in a real browser the way a reader does, against an isolated in-memory Redis, and capture proof. Use to prove a change to likes, share buttons, the theme toggle, blog search, the most-liked list, or the active-readers counter actually works, or whenever you need to run the site and observe it.
---

# Verify the Ted Vu blog

The site is an Astro 5 static site with Vue islands and a few on-demand API routes (`src/pages/api/**`, `prerender = false`) backed by Upstash Redis. Posts come from Contentful at render time. Readers touch it only through the browser, so verification is browser-driven with Playwright (`playwright-core`, using the installed Chrome or Edge).

**Isolation is the point of this harness.** `.env` holds the production Upstash credentials. `control.mjs up` starts `scripts/fake-upstash.mjs`, an in-memory Upstash REST stand-in, and launches `astro dev` with `UPSTASH_REDIS_REST_URL`/`TOKEN` overridden to it, so likes and presence never touch production. Contentful stays real and read-only (dev mode uses the preview token, so drafts can appear). Never run `npm run dev` yourself and click Like: that writes to production Redis.

All commands run from the repo root. `C=.claude/skills/verify-tedvublog/scripts/control.mjs` below.

## Launch

One-time: `npm install --prefix .claude/skills/verify-tedvublog` (installs `playwright-core`; no browser download, it uses installed Chrome/Edge). The site's own deps must be installed (`npm install`).

```
node .claude/skills/verify-tedvublog/scripts/control.mjs up            # default port 4329
node .claude/skills/verify-tedvublog/scripts/control.mjs up --port 4400
```

Ready when it prints `READY http://127.0.0.1:<port> ...`. `up` only prints that after `/blog/` renders posts from Contentful **and** a probe to `/api/likes/...` moves the fake Redis's command counter. If the API isn't bound to the fake, `up` tears down and exits non-zero rather than risk production writes. Startup takes ~10-40 s (Contentful fetch). Logs: `.verify/runs/<run>/astro.log` and `fake-upstash.log`.

Teardown is `down` (see Cleanup).

## Doctor

```
node .claude/skills/verify-tedvublog/scripts/control.mjs doctor
```

Read-only. Checks both recorded pids are alive, the fake answers and recognises the Lua script in `src/lib/likes.ts`, the site responds, and the likes API is bound to the fake (not production). It also prints whether the checkout's git rev matches what the instance started from (`+dirty` = uncommitted changes under `src/`, `package.json`, or `astro.config.mjs`). The dev server hot-reloads `src/`, so a rev mismatch is informational; restart after dependency or `astro.config.mjs` changes. Run doctor first whenever anything looks off. `DOCTOR OK` / exit 0 means the instance is worth driving.

## Drive

Journeys are scripted end-to-end proofs, one per feature in `features/`:

```
node .claude/skills/verify-tedvublog/scripts/control.mjs journey likes
node .claude/skills/verify-tedvublog/scripts/control.mjs journey all      # likes presence search share theme top-liked
HEADED=1 node .claude/skills/verify-tedvublog/scripts/control.mjs journey share   # watch it
```

Each prints `ok`/`FAIL` per check and exits non-zero on any failure. For a new or ad-hoc check, write a journey file in `journeys/` (copy the closest one) using the helpers in `scripts/lib.mjs`:

- `launchBrowser({ presence })`: `presence: true` hides `navigator.webdriver`; without it `ActiveReaders.vue` deliberately renders nothing.
- `newPage(browser, { colorScheme, permissions })`: fresh profile with `baseURL` set, so `page.goto("/blog/")` works. Collects console errors.
- `firstPost(page)`: first post on `/blog/` as `{ slug, title, postKey, path }`. Never hard-code slugs; they come from Contentful.
- `redis("dump" | "reset" | "seed", body)`: the fake's side channel, for preconditions and for reading stored state back. It is not a user path; never use it in place of the UI action you are proving.
- `evidence(feature)`: `check(name, ok, note)`, `shot(page, name)` (PNG + ARIA snapshot), `save(file, data)`, `finish()`.

Stable handles (prefer these):

| Thing | Handle |
| --- | --- |
| Like button | `.post-actions.top button[aria-pressed]` / `.post-actions.bottom ...`; accessible name `Like this post` → `You liked this post` |
| Share | inside `.share.top` / `.share.bottom`: links `Share on Facebook`, `Share on X`, `Share on WhatsApp`; buttons `Copy link`, `Share via…`; status `[data-share-status]` |
| Theme | button `Toggle dark mode` (`aria-pressed`), state on `document.documentElement.dataset.theme`, saved in `localStorage.theme` |
| Search | searchbox `Search posts` on `/blog/`; items `[data-post-slug]`; `No posts found`; alert `Search is unavailable right now...` |
| Most liked | heading `Most liked posts` on `/`; `No likes yet — be the first!` |
| Presence | text `Active readers: N` in the header |
| Nav | header links `Home`, `Blog`, `About`, `Top 100` (Blog goes to `/blog`, no trailing slash) |

You can also hit the API directly to read state: `curl http://127.0.0.1:4329/api/likes/blog/<slug>`, but proofs of UI behavior must go through the page.

## Evidence

Everything goes to `.verify/evidence/<run>/<feature>/` (gitignored): `steps.json` (every check, pass/fail, rev, base URL), `NN-name.png` + `NN-name.aria.yml` at key states, and Redis dumps (`redis-*.json`) as the second, read-only view of stored state.

Proof standards:

- Drive the real reader path: click the button, type in the box, follow the link. Seeding Redis is fine for preconditions (e.g. existing like counts), never as the action under test.
- Capture the action and the resulting state: a before and after shot, plus what was stored (Redis dump, `localStorage`, clipboard).
- Check side effects alongside the screen: one POST per like, the Redis count, the voter set, the presence set after a tab closes.
- The only mock is the Redis boundary (the fake). It emulates exactly the commands and the one Lua script the app uses; if `src/lib/likes.ts` changes its script, the fake refuses it and doctor fails. Update `fake-upstash.mjs` to match; don't bypass it. Atomicity under real concurrency is not proven by the fake.
- External share targets (facebook.com, x.com, wa.me) are intercepted in the share journey; record the popup URL, never load the real site.
- Report a failing check as a failure with its note. Don't loosen a check to make it pass; record the reason in that feature's Gotchas.

## Cleanup

```
node .claude/skills/verify-tedvublog/scripts/control.mjs down
```

Kills only the two pids this run recorded (process tree on Windows via `taskkill /T`), deletes `.verify/runs/<run>/`, and keeps `.verify/evidence/<run>/`. Never kill `node` by name: the user may have their own dev server running. Run `down` after every failed attempt too.

## Isolation and parallel runs

`VERIFY_RUN=<id>` namespaces state and evidence (`.verify/runs/<id>`, `.verify/evidence/<id>`). Each run gets its own fake Redis on a random port. Astro moves to the next free port if yours is taken, and `up` records the real URL. Two `astro dev` instances in **one checkout** share `.astro/` and the Vite cache. That works but is fragile, so prefer a separate git worktree for a second concurrent instance. `up` refuses to start a second instance for the same run id. Never drive an instance you didn't start (e.g. the user's `npm run dev` on 4321): it is wired to production Redis.

## Helpers

| Script | Use |
| --- | --- |
| `scripts/control.mjs up / doctor / journey <name> / redis dump / redis reset / redis seed '<json>' / down` | everything above |
| `scripts/fake-upstash.mjs` | started by `up`; don't run by hand |
| `scripts/lib.mjs` | imported by journeys |

`redis seed` takes `{"likes":{"blog/<slug>":3},"voters":{"blog/<slug>":["<hash>"]}}`.

## Feature map

`features/README.md` indexes one file per reader-facing feature, each with its sub-feature IDs, entry points, the exact journey, and gotchas. Keep it current when features change (`/pstack:maintain-verification-skill`).
