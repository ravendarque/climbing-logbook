# 24. Sync/offline status timeout belongs on the fetch, not on how long the animation runs

## Status

Accepted

## Context

[ADR-0023](0023-instant-shell-decoupled-content-loading.md) introduced the shell-level sync/offline indicator (`client/sync-status-icon.js`'s `createSyncStatusIcon()`), tracking `checkSession()`/`fetchSettings()`/`offline-sync.js`'s `pullDeltas()`. That original version (#787) included `STALE_AFTER_MS` — a fixed 15-second cap after which the indicator stopped counting a tracked promise toward "working," regardless of whether the underlying fetch had actually settled. The reasoning at the time: no fetch in this app set its own client-side timeout, so a genuinely dead connection could leave a promise neither resolved nor rejected indefinitely, leaving the icon spinning forever.

Raven's report (2026-09-19), reproduced with real devtools GPRS throttling: a real page load legitimately took 2-10 minutes on local dev, but the indicator showed nothing for almost all of that window — it flashed briefly, then reverted to idle, then the page finally finished loading with no further signal either way. Root cause: the 15-second cap fired long before the (real, if slow) fetches actually completed, silently misrepresenting genuine progress as "nothing happening." Since this app's shell reconcile never blocks the user — [ADR-0023](0023-instant-shell-decoupled-content-loading.md)'s whole point is that the shell renders instantly and content/sync happen underneath — there was never a real UX reason to rush the *signal*. The cap was solving a real problem (a truly hung request) at the wrong layer: it capped the *display*, not the *risk*.

## Decision

**The sync/offline indicator must be genuinely representative of what a tracked operation is actually doing.** Concretely: no fixed cap on how long "working" may be shown — it reflects real in-flight state for as long as that's true, however long that takes. Instead, a real per-request `AbortSignal.timeout(120000)` (2 minutes; #850) sits on each of the three actual fetches (`admin-auth.js`'s `checkSession()`/`fetchSettings()`, `offline-sync.js`'s `pullDelta()`) — a safety net against a request that will genuinely never settle, not a UX-paced cutoff. 120 seconds was chosen deliberately generous: since nothing blocks the user, there's no cost to waiting far longer than any real-but-slow connection would need, and the only job this number does is eventually flag a connection that's truly dead rather than merely slow.

When a timeout specifically fires (checked via `err.name === "TimeoutError"`, distinct from any other network failure, which these functions already handled silently before this change), the calling code reports it through a new `reportTimeout()` on the tracker, forcing "offline" once every currently-tracked call has settled — not immediately, so it never overwrites a sibling operation that's still genuinely in flight. This exists because `navigator.onLine` (the indicator's other offline signal) can legitimately still read `true` on a connection that's technically up but functionally dead or extremely slow — confirmed live under GPRS throttling — so it can't be trusted alone to catch this case.

`createAdminAuth()`'s factory gained one more injected callback, `onFetchTimeout` (defaulting to a no-op), following the same pattern its existing `updateAdminBar` callback already used — threaded through by the 10 composition roots that wrap `checkSession()`/`fetchSettings()` in the tracker; the four admin-hidden-style pages that don't (`account`, `account/edit`, `account/import`, `beta-gate`) pass nothing and get the no-op.

## Consequences

- `STALE_AFTER_MS` and its `setTimeout` are gone entirely from `sync-status-icon.js` — a future change that wants to "fix" a long-spinning indicator by re-adding a display-side cap would be reversing this decision, not fixing a bug; the fix belongs on whichever fetch is actually slow.
- The 120-second figure is a safety-net constant, not a tuned UX value — it doesn't need revisiting unless a real request pattern needs a materially different bound (e.g. a genuinely large payload that could exceed it on a real, working, very slow connection).
- `sync-status-icon.js`'s own tests (`test/client/sync-status-icon.test.js`) now cover `reportTimeout()`'s batching behavior (offline only surfaces once every tracked call has settled) instead of the old fixed-timeout mechanism; `admin-auth.js`'s tests cover `onFetchTimeout` firing on a real `TimeoutError` and not on any other error.
- Any *new* background fetch this shell tracks in the future (a fourth reconcile call, say) needs the same treatment — its own `AbortSignal.timeout()` and a `reportTimeout()` call on that specific failure — not a shared or implicit cap.
