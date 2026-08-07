# 12. Client-side modularization: esbuild + ES modules + factories, no framework

## Status

Accepted

## Context

Client-side logic originally lived entirely inline in `index.html`'s
`<script type="module">` — by the time this became a problem (#206,
~3,072 lines in one file by the time the modularization epic #233
finished extracting from it), it was untestable in isolation, hard to
navigate, and every feature addition made the file larger with no
structural pressure pushing back. `docs/ui-stack-evaluation.md` (ADR-0004)
had already rejected a component framework (Radix/React) for styling
reasons at #45 — this was a separate question: does breaking up a large
file require a framework, or can plain JS modules do it?

## Decision

**No frontend framework.** `client/main.js` is bundled by esbuild into
`public/logbook/app.js` (#220) — the only new tool introduced is a
bundler, not a framework or a templating system. Pure-logic pieces (grade
data, offline-queue merge, filter/sort, grade-pyramid stats, map geometry)
were extracted first, each gaining direct Vitest coverage as they moved
(ADR-0011's second layer) — deliberately incremental, not a rewrite.

**DOM-owning modules are factories** (`createLogbookView()`,
`createMapView()`, `createEntryForm()`, etc.), not classes or bare
function exports — each takes only the collaborators it actually needs as
constructor arguments (dependency injection over reaching for shared
globals), instantiated once in `main.js`'s composition root. Stateless
utilities (`createDisclosure`, country data) are plain imports instead,
not threaded through as injected params, once #242 established that
distinction wasn't worth the pass-through boilerplate for anything with no
internal state.

**A single Store, addressed through named methods, not raw field access**
(`client/store.js`, #234) — Tell-Don't-Ask: view modules call
`store.setEntries(...)`, never mutate a shared array directly. Reactivity
(`subscribe`/`notify`, #219/#264) is a plain array of callbacks, no
library — `render()` is the Store's one subscriber, so every module
mutates the Store and lets that subscription drive the re-render, rather
than each mutation site manually calling `render()`/`updateAdminBar()`
afterward (this removed roughly 20 manual call sites across six modules
when it landed).

**`main.js` itself is a thin composition root**, not a growing pile of
logic — config/URL constants, every module's instantiation, `render()`,
and `boot()`. Each of the eight modules extracted from it (logbook-view,
map-view, pyramid-view, entry-form, place-picker, admin-auth,
header-chrome, modal-utils) has one clear owning concern.

## Consequences

- The whole client stays "no framework, no build step for JS" in spirit —
  `docs/app-architecture.md`'s description of the client only needed
  updating to add one bundler, not rewritten around a framework's mental
  model.
- DOM-heavy modules stay outside Vitest's unit-test layer by design
  (ADR-0011) — their correctness is verified by Playwright instead, an
  accepted tradeoff rather than a gap to backfill.
- The factory/DI pattern means every module's actual dependency list is
  visible at its call site in `main.js` — a module that starts needing a
  new collaborator makes that visible as a diff to the composition root,
  not a silent new global reference buried inside the module itself.
- This was a multi-PR epic (#233's eight extractions plus #261-#264's
  follow-up polish), not a single rewrite — each extraction shipped
  independently, testable and revertable on its own.
