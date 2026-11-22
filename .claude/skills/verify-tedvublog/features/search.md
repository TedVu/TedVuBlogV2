# Search

On `/blog/`, a search box filters the list of posts as the reader types, using a fuzzy index loaded from `/search-index.json`. A query with no matches says `No posts found`, and clearing the box shows every post again.

## Sub-features

- `search-match`: typing a post's title leaves that post visible.
- `search-empty`: a nonsense query hides every post and shows `No posts found`.
- `search-clear`: emptying the box restores the full list and hides the empty message.
- `search-error`: if the index fails to load, an alert `Search is unavailable right now. Showing all posts.` appears and every post stays visible.

## How to get to it (user POV)

- Click `Blog` in the header and type in `Search posts...`.

## Driving it with control.mjs

Preconditions:

- Instance is up and `doctor` reports `DOCTOR OK`.
- `/blog/` lists at least one post.

- **Run it.** `node .claude/skills/verify-tedvublog/scripts/control.mjs journey search`. The run ends with `PASSED: search`.
- **Match.** Fill searchbox `Search posts` with the first post's full title. That post's `[data-post-slug]` item stays visible.
- **Empty.** Fill `zzqxjv`. `No posts found` appears and no `[data-post-slug]` is visible.
- **Clear.** Fill an empty string. All posts are visible again and `No posts found` is hidden.
- **Error banner.** The `alert` role stays hidden throughout.
- **Proof.** `01-match` and `02-empty` `.png`/`.aria.yml`, plus `steps.json` with the post count.

## Gotchas

- Results update after a 250 ms debounce. Wait for the DOM state, not a fixed sleep.
- `search-error` isn't scripted. Drive it with `context.route("**/search-index.json", r => r.abort())` before typing.
- The list comes from Contentful in dev with the preview token, so drafts may appear that aren't on the live site.
