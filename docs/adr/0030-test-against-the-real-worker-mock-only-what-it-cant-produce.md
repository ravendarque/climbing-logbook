# 30. Test against the real Worker; mock only what it can't produce; measure coverage

## Status

Accepted. Supersedes [ADR-0011](0011-three-layer-test-pyramid.md).

## Context

ADR-0011 set up three layers: Vitest in the real Workers runtime, Vitest on
extracted client logic (with a happy-dom project for DOM modules), and
Playwright for "a handful of golden paths". The first two still hold. The
third no longer describes the suite, and the gap hides bugs (#1095):

- The Playwright suite has 32 specs and about 200 tests, not a handful.
- 17 of those specs load a page harness (`/e2e-fixtures/pages/`) with
  `/-/api/*` faked by `e2e/mock-api.js`. The harness was built because owner
  routes couldn't be reached from Playwright locally, which stopped being
  true once `e2e/owned-route-url.js` reached them through `my.localhost`.
- When #1095 was filed the mock had already drifted from the server (it
  described a `lead` field the server no longer returned). A mocked spec
  passes when the client and the real API disagree, which is the class of bug the top layer exists to
  catch. Several review findings in #1074 (#1076, #1077, #1078, #1086) were
  exactly that, and none had a test.
- Nothing measured coverage, so "covered at the right layer" in the
  definition of done couldn't be checked.

## Decision

1. **The three layers stay** as ADR-0011 described them: real-runtime Vitest
   for `server/` and `shared/`; Vitest on client modules, under happy-dom
   where they need a DOM; Playwright against the production build and the
   real Worker. Full-page composition roots are still covered by Playwright,
   not unit tests.
2. **Playwright runs against the real Worker and D1 by default.** Page tests
   use real owner routes (`ownedRouteUrl()`, `addOwnedRouteSessionCookie()`)
   and seed their data through the real API.
3. **Mock only a state the backend can't produce on demand**: a 5xx, a
   request that never answers, a full device, being offline. Those tests
   intercept the one request they need with `page.route()` and let
   everything else through to the Worker. Component harnesses
   (`e2e/fixtures/*-entry.js`) stay, since they test a component against
   inputs, not a page against the API.
4. **The mocked page specs move to real routes a few at a time**,
   `log-page.spec.js` last because it is the largest. `e2e/mock-api.js` and
   the page harnesses are deleted when nothing uses them.
5. **Vitest measures coverage with Istanbul** (`pnpm test:coverage`; v8
   coverage can't see inside workerd). CI publishes the report on every PR
   and enforces a floor on `server/` and `shared/`, set just below the first
   measurement (server 97% statements, shared 96%). The floor is raised as
   coverage grows and never lowered to get a PR through. `client/` is
   reported but has no floor, because most of it is covered by Playwright,
   which this report doesn't count.

## Consequences

- An e2e failure means the page, the API or both are wrong, not that a fake
  has drifted. The cost is slower page tests, since each one seeds data
  through the Worker.
- Tests share one seeded database, so a page test must create what it
  asserts on (or use a user of its own), not rely on another test's rows.
- Coverage makes a gap visible, not a test good: a floor stops `server/` and
  `shared/` losing tests silently, and review still judges whether a change
  is tested at the right layer.
- Until the migration finishes, the suite has both styles. New page tests
  use real routes.
