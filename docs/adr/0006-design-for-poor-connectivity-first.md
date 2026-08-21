# 6. Design for poor connectivity as a first-class constraint

## Status

Accepted. Decision section trimmed 2026-08-13 (#359) -- it duplicated
`docs/coding-standards.md`'s Connectivity Resilience checklist almost
verbatim; the checklist itself is unchanged and still lives there. A pure
transcription fix, not a changed decision -- see `docs/adr/README.md`'s
rule on this. Scope refined by
[ADR-0017](0017-connectivity-first-scoped-to-owner-write-path.md)
(2026-08-21): this decision governs the owner's own write-path, not
every page in the app -- the core reasoning below is otherwise unchanged.

## Context

This app's actual usage environment is a climbing crag — where signal is
usually bad, not occasionally bad. Treating that as an edge case to
handle defensively, rather than the primary operating condition to design
around, would produce an app that works in the office and breaks exactly
where it's meant to be used. This principle was established early
(#111) and has since shaped several concrete, otherwise-non-obvious
decisions across the app rather than living as a single implementation.

## Decision

**"This app is built for bad connections, not despite them."** The actual
standing rules this governs (offline-first as the default rather than a
fallback, no network request at the moment of interaction for something
that could be available upfront, bundle-or-precache over fetch-on-open,
no CDN dependencies at runtime, client-generated UUIDs so a queued
offline write's identity is stable from creation to eventual sync) live
in `docs/coding-standards.md`'s Connectivity Resilience section — an
intentionally living checklist, not reproduced here, since a copy frozen
inside this ADR would silently drift out of sync the moment that section
is updated (see `docs/adr/README.md`'s own rule on this, added after this
duplication was found and corrected, #359).

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
