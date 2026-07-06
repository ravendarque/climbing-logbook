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

`docs/app-architecture.md`'s "no framework, no build step, no client-side
bundler" line describes the current state of the app, not a fixed mandate —
this spike is exactly the place to reconsider it if there's a good reason
to. The two halves of "Radix + Tailwind" turn out to have very different
costs, so they get separate answers below rather than an up-or-down vote on
the pairing.

## Decision

**Adopt Tailwind. Reject Radix. Also add Floating UI for anchored
positioning, which neither of those two actually solves.**

## Tailwind: adopt

Tailwind needs a build step to be production-appropriate — Tailwind's own
docs describe the no-build Play CDN as unsuitable for production (no
purging, full utility-class runtime shipped to every visitor), so using it
"for real" means a CSS build step (Tailwind CLI or PostCSS) generating a
compiled stylesheet.

That build step is real but narrowly scoped: it only touches CSS. Nothing
about it requires a JS bundler, a framework, or changes to how `index.html`
loads its `<script type="module">` — it's an isolated, additive step
(compile a stylesheet, write it to `public/logbook/`) alongside the existing
`wrangler dev`/`wrangler deploy` scripts, not a replacement for the current
no-JS-bundler approach.

Weighed against that modest, isolated cost:

- It directly targets the actual pain point that triggered this spike —
  PR #44's back-and-forth was CSS styling churn on a single toggle, not a
  missing accessibility primitive (the toggle already had correct
  `aria-pressed`). Epic A adds several more one-off UI surfaces (chips,
  drill-downs, chart containers); without a shared utility vocabulary, that
  churn scales with the number of components instead of getting cheaper.
- Utility classes enforce a consistent spacing/color/type scale by
  construction (values come from `tailwind.config`, not ad hoc numbers typed
  per component), which is exactly the kind of consistency-across-surfaces
  problem a growing UI benefits from.
- It's widely known tooling, which lowers ramp-up cost for anyone (human or
  agent) touching styling later, versus a bespoke hand-rolled convention
  only this codebase uses.

**Migration cost:** add `tailwindcss` as a devDependency, a `tailwind.config`
scoped to `public/logbook/index.html`, a small input stylesheet compiled to
`public/logbook/styles.css`, and a `build:css` script wired into `dev`/
`deploy`. Existing hand-written CSS in `index.html` doesn't need a big-bang
rewrite — it can convert incrementally as components are touched, same as
any other refactor-as-you-go change.

## Radix: reject

Radix Primitives are React components — there's no framework-agnostic
Radix. Adopting it means adopting React, JSX, and a JS bundler underneath
it, which is a much bigger, much less reversible commitment than a CSS
build step: it changes what "frontend code" means for every file in
`public/logbook/`, not just how styles are authored.

That cost isn't justified by an actual gap. The project's existing
hand-rolled a11y patterns (`docs/coding-standards.md`'s Accessibility
section — `role="button"` + `tabindex="0"` + keydown handling,
`role="dialog"` + focus trap, correct `aria-pressed` usage) already work and
are enforced by review. They compose fine with plain markup, and nothing in
Epic A's or the map's requirements needs an accessible-primitive library to
do it — the actual gap (below) is positioning, not interaction semantics.

## What Radix would have covered, but Tailwind doesn't: anchored positioning

Map marker popovers, tooltips, and any dropdown/menu Epic A introduces need
*anchored positioning* — placing an element relative to a trigger, flipping
side when it would overflow the viewport, tracking scroll/resize. This is
the one genuinely hard-to-hand-roll piece (viewport collision math,
scroll/resize listeners cleaned up correctly), and it's exactly what Radix,
Base UI, and most other component kits use
[Floating UI](https://floating-ui.com/) internally for rather than solving
themselves.

**Add `@floating-ui/dom`** as a targeted dependency for this specific need.
Framework-agnostic, ships as plain ESM — imports directly into
`index.html`'s existing `<script type="module">` the same way
`escape-html.js` and `status-icons.js` do today. No bundler, no framework
required to use it; core package is a few KB. This is unaffected by the
Tailwind decision — it solves a different problem (positioning logic, not
styling) and stacks fine alongside a Tailwind-compiled stylesheet.

## Recommendation summary

1. Adopt Tailwind: add the CSS build step described above, migrate styling
   incrementally as components are touched rather than in one rewrite.
2. Reject Radix: keep hand-rolling accessibility per
   `docs/coding-standards.md`'s existing, working patterns.
3. Add `@floating-ui/dom` for anchor-positioned UI (map popovers, tooltips,
   dropdowns) — the one real gap neither Tailwind nor the status quo covers.
4. Chart library is explicitly out of scope for this decision — defer until
   #12/#15 land and there's a concrete rendering requirement to evaluate
   against.

**Revisit Radix specifically when:** markup/interaction-logic *duplication*
(not styling churn — Tailwind now addresses that) becomes the actual
bottleneck, e.g. the same tab/accordion/menu pattern gets hand-rolled
slightly differently three or four times across Epic A's increments. At
that point it's a framework decision on its own merits and should be scoped
as its own spike.

## Ethical/supply-chain check

Cross-checked against the BDS movement's [consumer boycott priority
targets](https://bdsmovement.net/Guide-to-BDS-Boycott) and its
tech-specific [No Tech for Oppression, Apartheid or Genocide
campaign](https://bdsmovement.net/no-tech-oppression-apartheid-or-genocide)
(checked 2026-07-06):

| Dependency | Maintainer | On either list? |
|---|---|---|
| Tailwind CSS (adopted) | Tailwind Labs | No |
| `@floating-ui/dom` (adopted) | Floating UI org (ex-Popper.js team) | No |
| Radix Primitives (rejected) | WorkOS | No |
| `wrangler` (existing) | Cloudflare | No |
| `semver` (existing) | npm/open source | No |

None of the stacks evaluated here, nor the project's existing dependencies,
appear on either list. Noted for future reference: **Microsoft** does
appear on both BDS lists — irrelevant to this decision since nothing
proposed here is Microsoft-authored, but worth re-checking if a future
dependency choice (e.g. TypeScript tooling, or React itself if Radix is
ever revisited) pulls one in.
