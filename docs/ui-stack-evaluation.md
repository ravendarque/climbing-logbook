# UI Stack Evaluation

Spike output for #45. This is a design decision, not an implementation — no
code changes accompany this doc.

Status: Decided, 2026-07-06.

---

## Question

Epic A (#5) and the map (#6) are about to add substantially more UI surface
(charts, evidence-tiering chips, drill-down views, map marker interactions)
than the current single-toggle logbook has needed so far — see PR #44's
back-and-forth over one toggle switch's styling as the trigger for this
spike. Should the project adopt a component/styling stack (Radix primitives
+ Tailwind was suggested as a starting candidate) before that work lands, or
keep hand-rolling markup/CSS per component as it has so far?

## Decision

**Do not adopt Radix + Tailwind. Add one narrowly-scoped dependency
(Floating UI) for anchored-positioning only, formalize a small set of design
tokens in the existing inline stylesheet, and keep hand-rolling everything
else.**

## Why Radix + Tailwind doesn't fit

`docs/app-architecture.md` documents no-framework, no-build-step as a
deliberate choice, not an oversight. Radix + Tailwind conflicts with both
halves of that at once, not just the build-step half the issue called out:

- **Radix Primitives are React components.** There's no framework-agnostic
  Radix — adopting it means adopting React, JSX, and a bundler underneath
  it. That's a framework decision wearing a styling decision's clothes; it's
  a far bigger shift than the UI work itself requires, and it isn't
  reversible the way swapping a CSS approach is.
- **Tailwind needs a build step to be production-appropriate.** Tailwind's
  own docs describe the no-build Play CDN as unsuitable for production (no
  purging, full runtime cost shipped to every visitor). Using it "for real"
  means PostCSS or the Tailwind CLI in the build pipeline — exactly the
  build step `docs/app-architecture.md` opted out of.
- **The bundle-size/cold-start framing in the issue doesn't quite apply as
  written.** Per `docs/app-architecture.md`'s routing section, Workers
  Static Assets serves `public/` files directly without invoking the Worker
  at all — so a heavier frontend bundle doesn't touch Worker cold starts.
  The real cost is client download/parse size on every visit (this app is
  offline-first and PWA-installed, so that cost is paid once per app-shell
  update, not per page load) — worth naming precisely rather than
  conflating with Worker cold start.

Given that, the accessibility-primitive benefit Radix would bring is real
but not free: the project's existing hand-rolled a11y patterns
(`docs/coding-standards.md`'s Accessibility section — `role="button"` +
`tabindex="0"` + keydown handling, `role="dialog"` + focus trap, correct
`aria-pressed` usage) already work and are enforced by review. They compose
fine with plain markup; there's no evidence yet that Epic A's UI needs more
than what those patterns already cover.

## What Epic A/the map actually need

Looking past the "adopt a stack" framing to the concrete upcoming surfaces:

- **Evidence-tiering chips, drill-down views, charts:** markup and layout
  problems, not accessibility or positioning problems. Hand-rolled markup +
  CSS handles these the same way it handles today's UI.
- **Map marker popovers, tooltips, any dropdown/menu:** these need
  *anchored positioning* — placing an element relative to a trigger, flipping
  side when it would overflow the viewport, tracking scroll/resize. This is
  the one genuinely hard-to-hand-roll piece (viewport collision math,
  scroll/resize listeners cleaned up correctly), and it's exactly what
  Radix, Base UI, and most other component kits use
  [Floating UI](https://floating-ui.com/) internally for rather than solving
  themselves.

That narrows the actual gap to one thing: positioning logic, not a
component framework.

## Recommendation

1. **Add `@floating-ui/dom`** as a targeted dependency for anchor-positioned
   UI (map marker popovers, any tooltip/dropdown Epic A introduces).
   Framework-agnostic, ships as plain ESM — imports directly into
   `index.html`'s existing `<script type="module">` the same way
   `escape-html.js` and `status-icons.js` do today. No bundler, no build
   step, no framework required to use it. Core package is a few KB.
2. **Formalize design tokens** (spacing scale, color palette, type scale) as
   CSS custom properties in the existing inline `<style>` block, plus a
   small hand-authored set of reusable utility classes for the patterns that
   actually recur (the kind of thing PR #44's toggle churn was really
   about). This captures most of Tailwind's day-to-day ergonomic win without
   its build step or purging machinery.
3. **Keep hand-rolling accessibility per `docs/coding-standards.md`'s
   existing patterns** for everything Floating UI doesn't cover (toggles,
   dialogs, sortable headers). They already compose correctly; there's no
   concrete pain point here to justify a framework.
4. **Chart library is explicitly out of scope for this decision** — defer
   until #12/#15 land and there's a concrete rendering requirement (e.g.
   whether SVG hand-rolled charts stay sufficient) to evaluate against.

**Migration cost: zero.** Nothing existing changes; this is purely additive
for new surfaces as they're built.

**Revisit when:** markup *duplication* (not styling churn) becomes the
actual bottleneck — e.g. the same tab/accordion/menu pattern gets
hand-rolled slightly differently three or four times across Epic A's
increments. At that point it's a framework decision on its own merits, not
a styling one, and should be scoped as its own spike rather than smuggled
in via a CSS utility library.

## Ethical/supply-chain check

Cross-checked against the BDS movement's [consumer boycott priority
targets](https://bdsmovement.net/Guide-to-BDS-Boycott) and its
tech-specific [No Tech for Oppression, Apartheid or Genocide
campaign](https://bdsmovement.net/no-tech-oppression-apartheid-or-genocide)
(checked 2026-07-06):

| Dependency | Maintainer | On either list? |
|---|---|---|
| `@floating-ui/dom` (new) | Floating UI org (ex-Popper.js team) | No |
| Radix Primitives (rejected) | WorkOS | No |
| Tailwind CSS (rejected) | Tailwind Labs | No |
| `wrangler` (existing) | Cloudflare | No |
| `semver` (existing) | npm/open source | No |

None of the stacks evaluated here, nor the project's existing dependencies,
appear on either list. Noted for future reference: **Microsoft** does
appear on both BDS lists — irrelevant to this decision since nothing
proposed here is Microsoft-authored, but worth re-checking if a future
dependency choice (e.g. TypeScript tooling, should this project ever adopt
a build step for other reasons) pulls one in.
