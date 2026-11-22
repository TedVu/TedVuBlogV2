---
name: verify-presence-formal
description: Model-check the "Active readers" presence protocol (ActiveReaders.vue heartbeats, pagehide leave beacon, presence.ts sorted set) with TLA+/TLC. Use before and after any change to src/components/ActiveReaders.vue, src/lib/presence.ts, or src/pages/api/presence/*, to prove readers are not dropped or left behind across tabs, reloads, and network delay.
---

# Verify the presence protocol

The header's `Active readers: N` comes from a small distributed protocol. Every tab of a browser shares one `visitorId` (localStorage). A visible tab POSTs `/api/presence` at once and then every `HEARTBEAT_MS`. Hiding the tab stops the timer. `pagehide` sends a `sendBeacon` to `/api/presence/leave`. The server keeps a Redis sorted set scored by its own `Date.now()` and counts members newer than `ACTIVE_WINDOW_MS`. Requests travel independently and can arrive in any order. Tests can't reach most of those orderings, so `model/Presence.tla` is checked with TLC over every ordering within the bounds below.

## Does my change touch this?

Yes, if the diff touches any file under Coverage. That includes CSS-only changes, because the coverage check can't tell what changed. In particular, re-check after changes to the heartbeat interval, the window, visitor id storage, when `start`/`stop` run, the leave beacon, or the Redis commands in `heartbeat`/`leave`.

## Run it

```
node .claude/skills/verify-presence-formal/scripts/check.mjs           # all four checks, ~10 s
node .claude/skills/verify-presence-formal/scripts/check.mjs timing    # one check
```

The first run downloads pinned tools into `.verify/tools/` (gitignored): `tla2tools.jar` v1.7.4, and on Windows without Java 11+ a portable Temurin JRE 17.0.13. Both are checksum-verified. Set `TLA2TOOLS` and `JAVA` to use your own. TLC output for each check goes to `.verify/formal/<check>/tlc.out`.

What the script does, in order:

1. **Binds the model to the code.** It reads `HEARTBEAT_MS` from `ActiveReaders.vue` and `ACTIVE_WINDOW_MS` from `presence.ts` and passes them to TLC in 10 s ticks. It also checks 10 code anchors: the facts the model's actions rely on (`start()` beats then sets the interval, hidden calls `stop()`, `pagehide` sends the beacon, ZADD scores with server time, inclusive ZREMRANGEBYSCORE, ZREM on leave, and the routes calling them). A missing anchor is **drift**, and nothing is checked.
2. **Checks coverage.** Any covered file that differs from the sync commit (committed or not) gives a warning.
3. **Runs TLC** for each check in `model/expected.json` and compares the outcome to the recorded expectation. It prints each violation as numbered steps in the code's terms.

Exit codes:

| Code | Meaning | What to do |
| --- | --- | --- |
| 0 | every check matches `expected.json` | done |
| 1 | an outcome changed | see "Real bug or modeling error?" |
| 2 | drift: an anchor or constant no longer matches | re-read the code, update `Presence.tla` and the anchor, then rerun |
| 3 | tool or TLC error | read the printed TLC tail or `tlc.out` |
| 4 | checks match, but covered code changed since the sync commit | review the diff against the model, then advance the sync commit |

Read every result, pass or fail, with the pstack `/statechart` skill on `model/Presence.tla` and the generated `.verify/formal/<check>/Presence.cfg`. It gives the shortest path to each broken rule in plain words, and draws the state chart when the rules hold.

## The rules

- **NoFalseDrop.** A reader looking at the site is counted. Once a heartbeat from a visible tab reaches the server, that browser stays counted for as long as the tab stays visible. *Harm if broken:* the count shows fewer readers than are reading.
- **LeaveIsFinal.** Closing the last tab removes the reader. When every tab is closed and every request has arrived, the browser is not counted. *Harm if broken:* a reader who left stays in the count for up to `ACTIVE_WINDOW_MS`.

| Check | Setup | Expected | Finding |
| --- | --- | --- | --- |
| `timing` | 1 tab, never reloaded | NoFalseDrop **holds** | Guards `HEARTBEAT_MS + latency < ACTIVE_WINDOW_MS` |
| `multi-tab` | 2 tabs, one browser | NoFalseDrop **violated** | F1 |
| `reload` | 1 tab, may reload | NoFalseDrop **violated** | F2 |
| `leave` | 1 tab | LeaveIsFinal **violated** | F3 |

### Known findings (as of the sync commit; product code not changed)

- **F1, closing one tab drops a browser that is still reading in another.** Tabs t1 and t2 are open. t1 closes, its `pagehide` beacon runs `ZREM presence <visitorId>`, and that id is shared with t2. The visible reader in t2 is uncounted until t2's next heartbeat, up to `HEARTBEAT_MS` (30 s). This is deterministic, not a race.
- **F2, a reload can uncount the reader it just counted.** A reload fires `pagehide` on the old page (leave) and loads a new page (heartbeat). The two go to different serverless functions. If the new page's heartbeat is handled before the old page's leave, the reader is uncounted for up to 30 s. `client:idle` delays the new heartbeat, so this is unlikely but possible.
- **F3, a heartbeat in flight at close leaves a ghost.** A heartbeat (timer or first mount) is in flight when the tab closes. The leave is handled first, then the heartbeat re-adds the reader, who stays counted for up to `ACTIVE_WINDOW_MS` (60 s) after leaving. The code calls leave "best effort", so this may be acceptable. It does contradict the "count drops right away" comment in `leave.ts`.

## Real bug or modeling error?

When a check's outcome changes:

1. Walk the printed steps against the code. For each step, ask whether the real code can do it at that moment in that order. Every action in `Presence.tla` names the function it stands for.
2. If every step is possible, it's a **real bug**. Report it with the steps in the code's terms. Don't weaken the rule or the model, and don't change product code unless asked.
3. If a step is impossible in the code, the **model is wrong**. Fix the action in `Presence.tla`, add or adjust an anchor in `check.mjs` that pins the code fact you relied on, and rerun.
4. If a known finding (F1–F3) stops reproducing because the code was fixed on purpose, set that check's `expect` to `{ "outcome": "pass" }` in `model/expected.json` and delete the finding from this file.
5. For an intended behavior change (e.g. a new message type), update `Presence.tla`, the anchors, `expected.json`, and this file together.

## Scope and bounds

Verified for one browser (one `visitorId`) with up to 2 tabs. Requests take at most 10 s (1 tick) to arrive and arrive in any order. Each tab can load or become visible at most twice. The run covers 140 s (`2 × window + 2` ticks). The timing constants come from the code.

Assumed or left out:

- **Lost requests.** A failed `fetch` is swallowed. Missing two heartbeats in a row drops a reader by design, and that is not modeled.
- **Latency over 10 s.** NoFalseDrop needs `HEARTBEAT_MS + latency < ACTIVE_WINDOW_MS`.
- **Server clock skew.** Scores come from `Date.now()` on whichever Netlify instance handles the request. The model has one clock.
- **Other visitors.** Their heartbeats only remove members that are already stale.
- **The whole-key `EXPIRE`.** It fires 2 × window after the last heartbeat, when every member is already stale.
- **The number shown on screen.** The model checks membership, which is what every ZCARD counts. The non-atomic Upstash pipeline only affects the number returned.
- **bfcache restores and Astro `ClientRouter` swaps** (no `pagehide` on swaps).

## Coverage

Sync commit: `9c89a6e`

- `src/components/ActiveReaders.vue`
- `src/lib/presence.ts`
- `src/pages/api/presence/index.ts`
- `src/pages/api/presence/leave.ts`

Confirmed against the code at `9c89a6e`. At the time of writing, the working tree also had a CSS-only change to `ActiveReaders.vue` (`color: var(--color-muted)`), which the model doesn't depend on. Move the sync commit forward only after you have confirmed that `Presence.tla` and the anchors describe the covered files at the new commit. Never move it just to silence exit code 4.

## Files

- `model/Presence.tla`: the model. Each action is commented with the code it stands for.
- `model/expected.json`: the checks (tabs, reload, rules) and their expected outcomes.
- `scripts/check.mjs`: tools, code binding, anchors, coverage, the TLC runs, and the step-by-step story.
