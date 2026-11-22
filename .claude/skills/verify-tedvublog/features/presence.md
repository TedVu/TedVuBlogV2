# Active readers

The header shows `Active readers: N`, the number of browsers that have a page of the site visible right now. Each browser sends a heartbeat every 30 s while the page is visible, and a reader drops out 60 s after their last heartbeat, or at once when they close the tab. Automated browsers are not counted.

## Sub-features

- `presence-count`: a first reader sees `1`. A second browser profile makes it `2`.
- `presence-leave`: closing a tab sends a leave beacon and removes that browser from the count.
- `presence-nav`: the counter stays in the header across client-side navigation (`transition:persist`).
- `presence-bots`: with `navigator.webdriver` set, no counter renders and no heartbeat is sent.
- `presence-hidden`: hiding the page (switching tabs) stops heartbeats, so the reader expires after 60 s.

## How to get to it (user POV)

- Open any page. The counter is at the top right of the header.

## Driving it with control.mjs

Preconditions:

- Instance is up and `doctor` reports `DOCTOR OK`.
- The journey resets the fake Redis itself.

- **Run it.** `node .claude/skills/verify-tedvublog/scripts/control.mjs journey presence`. The run ends with `PASSED: presence`.
- **Bots.** A default Playwright browser opens `/`. After 3 s there is no `Active readers:` text and the Redis `presence` set is empty.
- **Count.** A browser launched with `presence: true` opens `/` and shows `Active readers: 1`. A second profile opens `/blog/` and shows `Active readers: 2`. Redis `presence` has two members.
- **Leave.** Closing the second profile with `runBeforeUnload` brings `presence` back to one member within 5 s (`redis-after-leave.json`).
- **Nav.** Clicking `Blog` in the first profile keeps `Active readers: N` visible.
- **Proof.** `01-one-reader` and `02-two-readers` `.png`/`.aria.yml`, plus `steps.json`.

## Gotchas

- Without `launchBrowser({ presence: true })` the counter never appears. That's intended bot filtering, not a bug.
- Tabs in one profile share a visitor id (`localStorage.visitorId`), so two tabs count as one. Closing one of them sends a leave for the shared id, and the count drops until the other tab's next heartbeat (up to 30 s). The formal presence check covers this. Don't "fix" the journey around it.
- `presence-hidden` isn't scripted. It needs a 60 s wait. Drive it by emulating `document.visibilityState` and checking the Redis score age.
