# 11. Three-layer test pyramid: real Workers runtime, extracted-logic unit tests, Playwright E2E

## Status

Accepted

## Context

No test tooling existed in this repo at all before #26. Two distinct gaps
needed covering, and each had a real "what would actually catch a bug"
question behind it, not just "add some tests":

- **Backend/API layer (#203):** could tests run against hand-rolled mocks
  of KV/D1, or did they need to exercise the real Workers runtime?
  Hand-rolled mocks risk diverging from actual platform behavior in ways
  that only surface in production.
- **Rendering/UI layer (#218):** the backend layer and later the
  extracted-client-logic layer (#206) both structurally cannot catch
  UI-update-propagation bugs — state changes correctly but the DOM
  doesn't reflect it. That's specifically what motivated standing up a
  real-browser layer, and was flagged as a hard prerequisite before the
  reactive-state refactor (store.js's `subscribe`/`notify`, #219/#264)
  was safe to attempt — without it, a broken re-render trigger could ship
  invisibly.

## Decision

**Three layers, each targeting a failure mode the others structurally
can't catch:**

1. **`vitest` + `@cloudflare/vitest-pool-workers`** (#203) — Cloudflare's
   own recommended setup, running tests against the real Workers runtime
   (Miniflare) with actual bindings (KV, D1), not hand-rolled mocks.
   `vitest.config.js` is wired to `wrangler.jsonc` via the pool's config
   helper, so tests run with the same bindings/compat date as the real
   Worker. Covers `src/api/*`, `src/lib/*` — request handling, validation,
   storage.
2. **Plain Vitest on extracted pure-logic client modules** (#206) —
   grade ordering, date helpers, offline-queue merge logic, grade-pyramid
   stats, map geometry: anything with no DOM dependency gets pulled out of
   the DOM-heavy composition root and gains direct unit coverage as it's
   extracted (see ADR-0012).
3. **Playwright, against a real browser and a real `wrangler dev`**
   (#218) — the top layer, covering a handful of golden-path flows (app
   loads and renders, log a climb, toggle Athlete Mode, switch discipline
   tab, offline queue + sync, open Map/Grade Pyramid) rather than
   exhaustive interaction coverage. This formalized what
   `docs/coding-standards.md`'s verification section already asked for
   manually ("verify in an actual browser... not just by reading the
   code") into an automated, CI-enforced check.

Both `test` (layers 1+2, one Vitest run) and `e2e` are wired as required
GitHub status checks (`.github/workflows/test.yml`, `e2e.yml`), matching
how the release-label check is enforced (ADR-0008).

## Consequences

- DOM-heavy rendering code (`main.js`'s composition root, every view
  module's `render()`) deliberately isn't unit-tested — it doesn't
  benefit from unit testing on its own and is covered at the golden-path
  level by Playwright instead, an explicit tradeoff rather than a
  coverage gap.
- Extracted pure-logic modules get both a clear signal to extract them
  (once a piece of logic has no DOM dependency, it can move and gain
  direct coverage) and fast, in-process test feedback without spinning up
  a browser.
- The Playwright layer being a hard prerequisite for the reactive-state
  refactor is a concrete example of test infrastructure ordering actual
  feature work, not just following it.
- Golden-path E2E coverage is deliberately incomplete by design (#218's
  own scope) — expanded incrementally as flows prove valuable or
  regressions are found there, not built out exhaustively up front.
