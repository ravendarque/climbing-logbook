# 4. Adopt Tailwind for styling, reject Radix, add Floating UI

## Status

Accepted

## Context

Epic A (#5) and the map (#6) were about to add substantially more UI
surface (charts, evidence-tiering chips, drill-down views, map marker
interactions) than the app's single-toggle logbook had needed so far —
PR #44's back-and-forth over one toggle switch's styling was the concrete
trigger. The question (spiked in full in `docs/ui-stack-evaluation.md`,
#45, decided 2026-07-06): adopt a component/styling stack before that work
lands, or keep hand-rolling markup/CSS per component.

"Radix + Tailwind" was the starting candidate, but the two have very
different costs: Tailwind needs a CSS build step; Radix means adopting
React, JSX, and a JS bundler underneath it — a much bigger, much less
reversible commitment that changes what "frontend code" means for every
file in the app, not just how styles are authored.

## Decision

**Adopt Tailwind.** A CSS-only build step (compiles to a stylesheet,
written into `public/logbook/`) — isolated and additive, no JS bundler or
framework required alongside it. Directly targets the actual pain point
(styling churn scaling with UI surface) and enforces a consistent
spacing/color/type scale by construction.

**Reject Radix.** The project's existing hand-rolled accessibility
patterns (`docs/coding-standards.md`'s Accessibility section) already
work and are enforced by review; nothing in Epic A's or the map's
requirements needs an accessible-primitive library for interaction
semantics. Revisit only if markup/interaction-logic *duplication* (not
styling churn — Tailwind addresses that) becomes an actual bottleneck.

**Add `@floating-ui/dom`** for the one genuinely hard-to-hand-roll gap
neither Tailwind nor the status quo covers: anchored positioning (map
marker popovers, tooltips, dropdown/menu flipping and collision math).
Framework-agnostic, ships as plain ESM, vendored directly rather than
bundled or CDN-fetched (see `docs/app-architecture.md`'s "Frontend
structure" section for why — a live CDN dependency would violate this
project's connectivity-resilience standard, ADR-0006).

Both adopted dependencies (and the rejected Radix) were cross-checked
against the BDS movement's boycott lists as part of this same spike —
formalized on its own terms as ADR-0005, since that check now applies to
every dependency decision, not just this one.

See `docs/ui-stack-evaluation.md` for the full spike writeup, including
the detailed cost/benefit reasoning and migration plan.

## Consequences

- Styling migrated incrementally as components were touched, not in one
  rewrite — `index.html`'s only remaining hand-written CSS is the `:root`
  design-token block plus one narrow, documented exception.
- No framework was introduced — `docs/app-architecture.md`'s "no
  framework" description of the client stays true for JS; only CSS
  gained a build step.
- The client *did* later gain a JS bundler (esbuild, #206) for unrelated
  reasons — extracting `client/main.js` into real, testable ES modules —
  which this decision didn't anticipate or require. `@floating-ui/dom`
  stayed external/vendored rather than pulled into that bundle, since the
  reasoning above (CDN-avoidance, not bundle-avoidance) still applies.
- Chart library selection was explicitly deferred out of this decision's
  scope, to be evaluated separately once a concrete rendering requirement
  exists.
