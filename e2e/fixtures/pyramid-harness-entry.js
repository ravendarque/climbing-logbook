// Test-only entry point for e2e/fixtures/pyramid-harness.html (#407 Tier 1,
// updated #111). Bundled by `pnpm run e2e:build-fixtures` into
// public/e2e-fixtures/pyramid-harness.js -- see .gitignore's own comment on
// why that output is never part of a real deploy.
//
// #111 -- <climbing-grade-pyramid> no longer computes anything itself
// (server/api/performance.js does, in production); this fixture now
// mirrors that split, computing pyramidData here via the real
// shared/pyramid-stats.js (same function the server runs) rather than
// setting raw entries on the component directly, same "prove the actual
// production code path" reasoning map-harness-entry.js already
// established.
import { pyramidSplitRows } from "../../shared/pyramid-stats.js";

const today = new Date().toISOString().slice(0, 10);
// #737 -- used to span wider than the pyramid's default top-4-grades
// window (5C through 8A) so e2e/component-harnesses.spec.js's own show/
// hide-lower-grades test had a real lower section to toggle -- that
// section (and its test) are gone now (the pyramid is a pure 8-4-2-1
// report), but this wider range is still harmless, realistic data for
// the citations-overlay test that remains.
const entries = [
  { id: "e0", type: "boulder", status: "send", grade: "5C", date: today },
  { id: "e1", type: "boulder", status: "send", grade: "6A", date: today },
  { id: "e2", type: "boulder", status: "send", grade: "6B", date: today },
  { id: "e3", type: "boulder", status: "send", grade: "6C", date: today },
  { id: "e4", type: "boulder", status: "send", grade: "7A", date: today },
  { id: "e5", type: "boulder", status: "send", grade: "8A", date: today },
];

document.querySelector("climbing-grade-pyramid").pyramidData = {
  boulder: pyramidSplitRows("boulder", entries),
  lead: pyramidSplitRows("lead", entries),
};
