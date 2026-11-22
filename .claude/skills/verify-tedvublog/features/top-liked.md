# Most liked

The home page shows `Most liked posts`: up to five published posts ranked by like count, each linking to the post. With no likes it says `No likes yet — be the first!`.

## Sub-features

- `top-empty`: an empty store shows the empty prompt.
- `top-order`: rows are sorted by count, highest first, each showing its count.
- `top-filter`: posts with zero likes and keys for posts that no longer exist are skipped.
- `top-link`: each row links to `/<section>/<slug>/` and opens the post.

## How to get to it (user POV)

- Open the home page `/` (or click `Home` in the header) and scroll to `Most liked posts`.

## Driving it with control.mjs

Preconditions:

- Instance is up and `doctor` reports `DOCTOR OK`.
- `/blog/` lists at least two posts. Otherwise the journey fails with `precondition: at least two published posts`.

- **Run it.** `node .claude/skills/verify-tedvublog/scripts/control.mjs journey top-liked`. The run ends with `PASSED: top-liked`.
- **Empty.** Reset Redis and open `/`. `No likes yet — be the first!` is visible.
- **Seed.** Seed the first two posts with 2 and 5 likes, plus `blog/no-such-post-verify: 9` and `blog/zero-verify: 0` (saved to `seeded.json`).
- **Order and filter.** In a fresh profile, open `/`. The list has exactly two rows: the 5-like post first, then the 2-like post (`rows.json`).
- **Link.** The first row links to `/blog/<slug>/`. Clicking it opens a page whose H1 is that post's title.
- **Proof.** `01-top-liked.png`/`.aria.yml` and `steps.json`. The journey resets Redis at the end.

## Gotchas

- `/api/likes/top` is served with `Cache-Control: public, max-age=60`. A profile that already loaded `/` keeps showing the old list for up to 60 s, so use a fresh profile after seeding. Real readers see the same delay after liking.
- Seeding is a precondition here (counts can't come from the UI on one IP). The like action itself is proven by the likes feature.
