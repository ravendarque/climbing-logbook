# 6. Design for poor connectivity as a first-class constraint

## Status

Accepted

## Context

This app's actual usage environment is a climbing crag — where signal is
usually bad, not occasionally bad. Treating that as an edge case to
handle defensively, rather than the primary operating condition to design
around, would produce an app that works in the office and breaks exactly
where it's meant to be used. This principle was established early
(#111) and has since shaped several concrete, otherwise-non-obvious
decisions across the app rather than living as a single implementation.

## Decision

**"This app is built for bad connections, not despite them"**
(`docs/coding-standards.md`) governs several standing rules, applied
consistently rather than case-by-case:

- **Offline-first as the default, not a fallback.** The service worker
  (`sw.js`) is network-first with cache-fallback for GETs; writes made
  offline (or when a request throws) queue in `localStorage` as an
  append-only event log (#268) and replay in order once back online —
  manually, after login, or on the browser's `online` event.
- **Don't put a network request at the moment of interaction for
  something that could be available upfront instead.** A lazy/on-demand
  fetch that saves bytes on the common case is still the wrong tradeoff
  here — it places the network dependency exactly where it's most likely
  to fail (mid-interaction on a flaky connection), not at initial load,
  which the service worker/offline queue already treat as the resilience
  boundary.
- **Bundle small, static, rarely-changing datasets directly into the
  app** (e.g. the `COUNTRIES` list) rather than fetching them on demand.
  Larger datasets that don't justify always-loading (the World Map's
  per-projection JSON) are still fetched once and cached after first
  load via the service worker, never left as an uncached fetch-on-open —
  and, when a fetch genuinely is necessary and can't be pre-cached, fail
  visibly with a plain "you need to be online" message and a Retry,
  rather than pretending to work offline.
- **No CDN dependencies at runtime.** Third-party browser code
  (`@floating-ui/dom`, ADR-0004) is vendored into the repo and served
  from this app's own origin rather than fetched from a CDN — a CDN
  fetch is exactly the kind of uncached network dependency this standard
  rules out, same reasoning as bundling static data inline.
- **Client-generated UUIDs for entity IDs**, not server-derived/slugified
  strings — a queued offline write's identity has to be stable from
  creation through however long it takes to actually sync, and a
  previous slug-based scheme caused a real desync bug between the
  offline queue and server-side collision-renaming.

This is stated as an ongoing design constraint applied to new work, not a
single feature that shipped once — #111 tracks the broader initiative
(progressive/streamed data loading) this principle is part of.

## Consequences

- Every new feature gets evaluated against this standard as a matter of
  course (`docs/coding-standards.md`'s review framework has a dedicated
  persona/section for it), not just at the point #111 originally landed.
- Some tradeoffs this standard forces are otherwise non-obvious wins —
  e.g. bundling `COUNTRIES` inline costs bytes on every load in exchange
  for zero runtime fetch risk; a smaller, more "efficient" on-demand
  fetch would be strictly worse for this app's actual usage pattern.
- The one deliberate, documented exception is the Map tab's per-projection
  JSON (fetched on demand, cached after first load) — the map is never
  needed at the crag, so a failed fetch degrading to a plain retry prompt
  is an accepted, narrow carve-out rather than a silent violation.
