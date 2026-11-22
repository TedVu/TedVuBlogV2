------------------------------- MODULE Presence -------------------------------
(***************************************************************************)
(* The "Active readers: N" protocol, for ONE browser (one visitorId shared  *)
(* by all its tabs through localStorage) talking to the presence sorted set *)
(* in Redis.                                                                *)
(*                                                                          *)
(* Code this model stands for (open these to review it):                   *)
(*   src/components/ActiveReaders.vue                                       *)
(*     getVisitorId   one id per browser, shared by every tab               *)
(*     start / beat   POST /api/presence now, then every HEARTBEAT_MS       *)
(*     stop           clearInterval on visibilitychange -> hidden           *)
(*     onPageHide     navigator.sendBeacon("/api/presence/leave")           *)
(*   src/lib/presence.ts                                                    *)
(*     heartbeat      ZADD presence {score: Date.now()} ; ZREMRANGEBYSCORE  *)
(*                    0 (now - ACTIVE_WINDOW_MS) ; ZCARD ; EXPIRE           *)
(*     leave          ZREM presence visitorId                               *)
(*   src/pages/api/presence/index.ts, leave.ts   thin wrappers             *)
(*                                                                          *)
(* Time is discrete: one tick is TickMs of wall time (scripts/check.mjs     *)
(* derives Heartbeat and Window from the constants in the code).            *)
(***************************************************************************)
EXTENDS Naturals, FiniteSets

CONSTANTS
    Tabs,         \* browser tabs of this one visitor, e.g. {t1, t2}
    Heartbeat,    \* HEARTBEAT_MS in ticks   (ActiveReaders.vue)
    Window,       \* ACTIVE_WINDOW_MS in ticks (presence.ts)
    MaxDelay,     \* assumed worst network latency of one request, in ticks
    MaxTime,      \* how far the model runs, in ticks
    AllowReopen,  \* may a closed tab load the page again (reload, back)?
    MaxEpoch      \* bound on loads + switch-backs per tab (state-space limit)

VARIABLES
    now,      \* server clock (Date.now() in heartbeat), in ticks
    tab,      \* tab -> "closed" | "visible" | "hidden"
    opened,   \* tab -> has it ever loaded the page
    epoch,    \* tab -> bumps each time the tab loads or becomes visible
    nextBeat, \* tab -> when setInterval fires next (meaningful while visible)
    net,      \* requests sent and not yet handled by the server
    inSet,    \* is visitorId a member of the presence sorted set
    score,    \* its score: the server time of the last heartbeat handled
    seen      \* tab -> has a heartbeat sent in its current visible epoch arrived

vars == <<now, tab, opened, epoch, nextBeat, net, inSet, score, seen>>

Msg == [kind : {"hb", "leave"}, tab : Tabs, epoch : Nat, sent : Nat]

\* Counted by any ZCARD taken now: a member whose score is inside the window.
\* ZREMRANGEBYSCORE 0 (now - Window) is inclusive, so score must be > now - Window.
Counted == inSet /\ score + Window > now

TypeOK ==
    /\ now \in 0..MaxTime
    /\ tab \in [Tabs -> {"closed", "visible", "hidden"}]
    /\ opened \in [Tabs -> BOOLEAN]
    /\ epoch \in [Tabs -> Nat]
    /\ nextBeat \in [Tabs -> Nat]
    /\ net \subseteq Msg
    /\ inSet \in BOOLEAN
    /\ score \in Nat
    /\ seen \in [Tabs -> BOOLEAN]

Init ==
    /\ now = 0
    /\ tab = [t \in Tabs |-> "closed"]
    /\ opened = [t \in Tabs |-> FALSE]
    /\ epoch = [t \in Tabs |-> 0]
    /\ nextBeat = [t \in Tabs |-> 0]
    /\ net = {}
    /\ inSet = FALSE
    /\ score = 0
    /\ seen = [t \in Tabs |-> FALSE]

Send(kind, t, e) == net' = net \cup {[kind |-> kind, tab |-> t, epoch |-> e, sent |-> now]}

\* onMounted with the page visible: start() beats at once, then every Heartbeat.
YouOpenTab(t) ==
    /\ tab[t] = "closed"
    /\ AllowReopen \/ ~opened[t]
    /\ tab' = [tab EXCEPT ![t] = "visible"]
    /\ opened' = [opened EXCEPT ![t] = TRUE]
    /\ epoch' = [epoch EXCEPT ![t] = @ + 1]
    /\ nextBeat' = [nextBeat EXCEPT ![t] = now + Heartbeat]
    /\ seen' = [seen EXCEPT ![t] = FALSE]
    /\ Send("hb", t, epoch[t] + 1)
    /\ UNCHANGED <<now, inSet, score>>

\* onMounted in a background tab: no start(), no heartbeat.
YouOpenTabInBackground(t) ==
    /\ tab[t] = "closed"
    /\ AllowReopen \/ ~opened[t]
    /\ tab' = [tab EXCEPT ![t] = "hidden"]
    /\ opened' = [opened EXCEPT ![t] = TRUE]
    /\ epoch' = [epoch EXCEPT ![t] = @ + 1]
    /\ seen' = [seen EXCEPT ![t] = FALSE]
    /\ UNCHANGED <<now, nextBeat, net, inSet, score>>

\* visibilitychange -> hidden: stop(). No leave is sent.
YouSwitchAway(t) ==
    /\ tab[t] = "visible"
    /\ tab' = [tab EXCEPT ![t] = "hidden"]
    /\ seen' = [seen EXCEPT ![t] = FALSE]
    /\ UNCHANGED <<now, opened, epoch, nextBeat, net, inSet, score>>

\* visibilitychange -> visible: start() beats at once and restarts the timer.
YouSwitchBack(t) ==
    /\ tab[t] = "hidden"
    /\ tab' = [tab EXCEPT ![t] = "visible"]
    /\ epoch' = [epoch EXCEPT ![t] = @ + 1]
    /\ nextBeat' = [nextBeat EXCEPT ![t] = now + Heartbeat]
    /\ seen' = [seen EXCEPT ![t] = FALSE]
    /\ Send("hb", t, epoch[t] + 1)
    /\ UNCHANGED <<now, opened, inSet, score>>

\* setInterval(beat, HEARTBEAT_MS) fires.
TimerFires(t) ==
    /\ tab[t] = "visible"
    /\ nextBeat[t] = now
    /\ nextBeat' = [nextBeat EXCEPT ![t] = now + Heartbeat]
    /\ Send("hb", t, epoch[t])
    /\ UNCHANGED <<now, tab, opened, epoch, inSet, score, seen>>

\* pagehide: sendBeacon(leave). Fires for visible and hidden tabs alike, and
\* for a reload or a navigation to another site, not only for closing.
YouCloseTab(t) ==
    /\ tab[t] # "closed"
    /\ tab' = [tab EXCEPT ![t] = "closed"]
    /\ seen' = [seen EXCEPT ![t] = FALSE]
    /\ Send("leave", t, epoch[t])
    /\ UNCHANGED <<now, opened, epoch, nextBeat, inSet, score>>

\* POST /api/presence -> heartbeat(): ZADD with score Date.now().
ServerHandlesHeartbeat(m) ==
    /\ m \in net /\ m.kind = "hb"
    /\ net' = net \ {m}
    /\ inSet' = TRUE
    /\ score' = now
    /\ seen' = IF tab[m.tab] = "visible" /\ m.epoch = epoch[m.tab]
               THEN [seen EXCEPT ![m.tab] = TRUE] ELSE seen
    /\ UNCHANGED <<now, tab, opened, epoch, nextBeat>>

\* POST /api/presence/leave -> leave(): ZREM.
ServerHandlesLeave(m) ==
    /\ m \in net /\ m.kind = "leave"
    /\ net' = net \ {m}
    /\ inSet' = FALSE
    /\ UNCHANGED <<now, tab, opened, epoch, nextBeat, score, seen>>

\* Requests arrive in any order (different Netlify functions, sendBeacon vs fetch).
\* Named wrappers so TLC reports these steps by name, not as "Next".
AHeartbeatArrives == \E m \in net : ServerHandlesHeartbeat(m)
ALeaveArrives == \E m \in net : ServerHandlesLeave(m)

\* One tick passes. Timers due now must fire first, and no request may be
\* older than MaxDelay ticks when it is handled.
TimePasses ==
    /\ now < MaxTime
    /\ \A t \in Tabs : tab[t] = "visible" => nextBeat[t] > now
    /\ \A m \in net : now + 1 <= m.sent + MaxDelay
    /\ now' = now + 1
    /\ UNCHANGED <<tab, opened, epoch, nextBeat, net, inSet, score, seen>>

\* The model stops at MaxTime; this keeps TLC from calling that a deadlock.
Done ==
    /\ now = MaxTime
    /\ UNCHANGED vars

Next ==
    \/ \E t \in Tabs : YouOpenTab(t)
    \/ \E t \in Tabs : YouOpenTabInBackground(t)
    \/ \E t \in Tabs : YouSwitchAway(t)
    \/ \E t \in Tabs : YouSwitchBack(t)
    \/ \E t \in Tabs : TimerFires(t)
    \/ \E t \in Tabs : YouCloseTab(t)
    \/ AHeartbeatArrives
    \/ ALeaveArrives
    \/ TimePasses
    \/ Done

Spec == Init /\ [][Next]_vars

\* Switching tabs back and forth can repeat without time passing; bound how
\* many times each tab may load or become visible so the state space is finite.
Bounded == \A t \in Tabs : epoch[t] <= MaxEpoch

-----------------------------------------------------------------------------
(* Rules, each in one plain sentence.                                      *)

\* A reader looking at the site is counted: once a heartbeat from a visible
\* tab has reached the server, that browser stays counted for as long as the
\* tab stays visible.
NoFalseDrop ==
    \A t \in Tabs : (tab[t] = "visible" /\ seen[t]) => Counted

\* Closing the last tab removes the reader: when every tab is closed and every
\* request has reached the server, the browser is not counted.
LeaveIsFinal ==
    ((\A t \in Tabs : tab[t] = "closed") /\ net = {}) => ~Counted
=============================================================================
