# Performance Insights: Injury/Pain Log (#39) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `/:username/performance/injury` — a chronological log of every entry with one or more tagged pain moves, plus a confidence-gated "your pain flags cluster on X" headline callout — the second of epic #5's five remaining Phase 2 views (after #584/#585's entry-data-capture deliverable).

**Architecture:** Server-side aggregation (`shared/injury-stats.js`, a pure DOM-free module mirroring `shared/pyramid-stats.js`'s exact precedent) computed in a new `handleGetInjuryLog` handler (`server/api/performance.js`, mirroring `handleGetPyramid`), fetched by a new composition root (`client/performance-injury-main.js`) that follows `client/performance-pyramid-main.js`'s exact boot/render/redirect pattern. New hub tile in `client/performance-hub-main.js`'s `INSIGHTS` array, new `/performance/injury` route through every layer `/performance/pyramid` already established (`owned-routes.js`, `server/index.js`'s regex, build scripts).

**Tech Stack:** Cloudflare Workers + D1, Vitest, Playwright, esbuild, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-08-27-performance-insights-ui-design.md` — "#39 injury/pain: interaction design" section. Also `docs/climbing-analytics-research.md` §6 (injury/pain paragraph) and issue #39's own GitHub body (both already fully consistent with the spec doc — no additional pinned specifics beyond what's below).

## Global Constraints

- **A log, not a chart** — no shared combo-chart component involved (that component doesn't exist yet either; #15/#38/#14 will build it when their turn comes). This view is markup only.
- **No evidence-tier chip** — this is the app's own data overlay, not a sourced external claim (unlike #14/#38). No citations-overlay/evidence-overlay modal machinery needed (contrast with `client/components/climbing-grade-pyramid.js`, which has both).
- **Confidence gate: minimum 5 total tags** for a cluster to be shown as a headline (placeholder, matches #13's own stated placeholder threshold — "tune once there's real data" is the design doc's own framing, not a number this plan invents differently for #39).
- **Ranking dimension: full 5-value combination** — `limb + side + holdType + movementStyle + wallAngle` together identify one "cluster." (Contrast with #13's 4-dimension cell — #13 ranks `entry_moves` rows, which have those same 4 tagging dimensions; `entry_pain_moves` rows have the identical 4 tagging dimensions too — limb/side/holdType/movementStyle/wallAngle is 5 values, matching this plan's own Deliverable-1 vocabulary exactly, `shared/entry-schema.js`'s `VALID_LIMBS`/`VALID_SIDES`/`HOLD_TYPES_BY_LIMB`/`MOVEMENT_STYLES_BY_LIMB`/`VALID_WALL_ANGLES`.)
- **`entries.deleted_at IS NULL` filtering is already handled for free** — `listForUser(env, "entries", userId, rowToJson, { excludeDeleted: true })` (the same call `handleGetPyramid` already makes) already excludes soft-deleted entries; this plan's new handler reuses that same call, so the gotcha epic #5's own Notes section flags is inherited-correct, not something this plan needs to add itself.
- **Ruling — `client/date-helpers.js` moves to `shared/date-helpers.js`.** `dateRank`/`formatDate` are pure, DOM-free functions (confirmed by reading the file — just `new Date(d).getTime()` and string formatting) that this plan's new server-side log-ordering logic needs to call from `shared/injury-stats.js`. Moving them is the same precedent `shared/pyramid-stats.js`'s own header comment already describes for itself ("Moved into shared/ (#111) ... these pure, DOM-free functions now run in the Worker too"). Task 1 does this move; every existing call site (`client/entries.js`, `client/components/climbing-entries-table.js`, `test/client/date-helpers.test.js`) is updated in the same task, not left with a compatibility shim.
- **Server response shape is structured data, not prose** — `shared/injury-stats.js`'s cluster/log functions return plain objects (`{limb, side, holdType, movementStyle, wallAngle, count}`); the headline sentence itself is generated client-side (`describeCluster`, also in `shared/injury-stats.js` so it's unit-testable, but called from the composition root) — same separation `pyramidSplitRows` already models (server computes structured tiers, `climbing-grade-pyramid.js` renders the prose).
- **Ruling — hold-type pluralization for the headline.** A naive `${holdType}s` breaks for `pinch` → `pinchs` (should be `pinches`) — the only word in the fixed vocabulary (`shared/entry-schema.js`'s `HOLD_TYPES_BY_LIMB`) ending in `ch`. `describeCluster` handles this with a two-branch rule (`endsWith("ch") ? "es" : "s"`), not a full pluralization library — correctly covers every current vocabulary word without over-engineering for words that don't exist yet.
- **Test commands**: `pnpm test` (Vitest), `pnpm exec playwright test` (Playwright, run twice for idempotency).
- **Deploy classification: beta-only, no migrations touched** (`entry_pain_moves` already exists from Phase 1). Needs a deliberate `promote.yml` run after merge — per Raven's explicit instruction this session, do **not** run it; leave this deliverable on beta same as #575/#583 and #584/#585.

---

## Task 1: `shared/date-helpers.js` (moved) + `shared/injury-stats.js` (new aggregation logic)

**Files:**
- Create: `shared/date-helpers.js` (moved from `client/date-helpers.js`, byte-identical content)
- Delete: `client/date-helpers.js`
- Modify: `client/entries.js` (import path only)
- Modify: `client/components/climbing-entries-table.js` (import path only)
- Create: `shared/injury-stats.js`
- Test: `test/shared/date-helpers.test.js` (moved from `test/client/date-helpers.test.js`), `test/shared/injury-stats.test.js` (new)

**Interfaces:**
- Consumes: `shared/entry-schema.js`'s `HOLD_TYPES_BY_LIMB` (already exists, `#584`) — used only to validate the plan's own pluralization claim during test-writing, not imported by the implementation itself.
- Produces: `shared/date-helpers.js` exports `dateRank(d)`, `formatDate(d)` (unchanged signatures, new location). `shared/injury-stats.js` exports: `MIN_TAG_COUNT` (= `5`), `painClusterCounts(entries)` → `Array<{limb, side, holdType, movementStyle, wallAngle, count}>`, `topPainCluster(entries, minCount = MIN_TAG_COUNT)` → one cluster object or `null`, `painLogEntries(entries)` → `Array<entry>` (entries with `painMoves.length > 0`, most-recent-first), `describeCluster(cluster)` → a headline sentence string.

- [ ] **Step 1: Move `client/date-helpers.js` → `shared/date-helpers.js`**

```bash
git mv client/date-helpers.js shared/date-helpers.js
```

Update the two import sites. `client/entries.js` (currently `import { dateRank } from "./date-helpers.js";`):

```js
import { dateRank } from "../shared/date-helpers.js";
```

`client/components/climbing-entries-table.js` (currently `import { formatDate } from "../date-helpers.js";`):

```js
import { formatDate } from "../../shared/date-helpers.js";
```

Move the test file too:

```bash
git mv test/client/date-helpers.test.js test/shared/date-helpers.test.js
```

Update its import (currently `import { dateRank, formatDate } from "../../client/date-helpers.js";`):

```js
import { dateRank, formatDate } from "../../shared/date-helpers.js";
```

- [ ] **Step 2: Run the moved test, confirm it still passes unchanged**

Run: `pnpm exec vitest run test/shared/date-helpers.test.js`
Expected: PASS (5 tests, same as before the move — this step proves the move alone didn't break anything, before any new code is added)

- [ ] **Step 3: Run the full suite to confirm no other regressions from the move**

Run: `pnpm test`
Expected: PASS

- [ ] **Step 4: Commit the move**

```bash
git add -A
git commit -m "Move date-helpers.js to shared/ -- injury-stats.js needs it server-side"
```

- [ ] **Step 5: Write the failing tests for `painClusterCounts`/`topPainCluster`**

Create `test/shared/injury-stats.test.js`:

```js
import { describe, expect, it } from "vitest";
import { MIN_TAG_COUNT, describeCluster, painClusterCounts, painLogEntries, topPainCluster } from "../../shared/injury-stats.js";

function entryWithPain(overrides = {}, painMoves = []) {
  return { id: "e1", name: "Test Route", date: "2026-01-01", painMoves, ...overrides };
}
function painRow(overrides = {}) {
  return { limb: "hand", side: "left", holdType: "crimp", movementStyle: "static", wallAngle: "overhang", ...overrides };
}

describe("painClusterCounts", () => {
  it("returns an empty array for entries with no pain moves", () => {
    expect(painClusterCounts([entryWithPain()])).toEqual([]);
  });

  it("counts one cluster from a single pain move", () => {
    const clusters = painClusterCounts([entryWithPain({}, [painRow()])]);
    expect(clusters).toEqual([{ limb: "hand", side: "left", holdType: "crimp", movementStyle: "static", wallAngle: "overhang", count: 1 }]);
  });

  it("sums counts for the same combination across multiple entries", () => {
    const clusters = painClusterCounts([
      entryWithPain({ id: "e1" }, [painRow()]),
      entryWithPain({ id: "e2" }, [painRow()]),
    ]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].count).toBe(2);
  });

  it("keeps different combinations as separate clusters", () => {
    const clusters = painClusterCounts([
      entryWithPain({ id: "e1" }, [painRow({ limb: "foot", side: "right", holdType: "toe-hook", movementStyle: "dynamic", wallAngle: "slab" })]),
      entryWithPain({ id: "e2" }, [painRow()]),
    ]);
    expect(clusters).toHaveLength(2);
  });

  it("counts multiple pain moves within one entry separately", () => {
    const clusters = painClusterCounts([
      entryWithPain({}, [painRow(), painRow({ wallAngle: "roof" })]),
    ]);
    expect(clusters).toHaveLength(2);
  });
});

describe("topPainCluster", () => {
  it("returns null when no cluster clears the minimum count", () => {
    const entries = [entryWithPain({}, [painRow()])]; // count = 1, well under MIN_TAG_COUNT
    expect(topPainCluster(entries)).toBeNull();
  });

  it("returns the cluster once it reaches the default minimum count", () => {
    const entries = Array.from({ length: MIN_TAG_COUNT }, (_, i) => entryWithPain({ id: `e${i}` }, [painRow()]));
    const top = topPainCluster(entries);
    expect(top).toMatchObject({ limb: "hand", side: "left", holdType: "crimp", count: MIN_TAG_COUNT });
  });

  it("returns the highest-count cluster when multiple clear the gate", () => {
    const entries = [
      ...Array.from({ length: MIN_TAG_COUNT }, (_, i) => entryWithPain({ id: `a${i}` }, [painRow()])),
      ...Array.from({ length: MIN_TAG_COUNT + 2 }, (_, i) => entryWithPain({ id: `b${i}` }, [painRow({ wallAngle: "roof" })])),
    ];
    const top = topPainCluster(entries);
    expect(top.wallAngle).toBe("roof");
    expect(top.count).toBe(MIN_TAG_COUNT + 2);
  });

  it("respects a custom minCount argument", () => {
    const entries = [entryWithPain({}, [painRow()]), entryWithPain({ id: "e2" }, [painRow()])];
    expect(topPainCluster(entries, 2)).not.toBeNull();
    expect(topPainCluster(entries, 3)).toBeNull();
  });
});

describe("painLogEntries", () => {
  it("excludes entries with no pain moves", () => {
    expect(painLogEntries([entryWithPain()])).toEqual([]);
  });

  it("includes entries with at least one pain move", () => {
    const entries = [entryWithPain({}, [painRow()])];
    expect(painLogEntries(entries)).toHaveLength(1);
  });

  it("sorts most-recent-first", () => {
    const entries = [
      entryWithPain({ id: "old", date: "2025-01-01" }, [painRow()]),
      entryWithPain({ id: "new", date: "2026-01-01" }, [painRow()]),
    ];
    expect(painLogEntries(entries).map(e => e.id)).toEqual(["new", "old"]);
  });

  it("treats a missing date as oldest, same as dateRank's own null handling", () => {
    const entries = [
      entryWithPain({ id: "undated", date: null }, [painRow()]),
      entryWithPain({ id: "dated", date: "2025-01-01" }, [painRow()]),
    ];
    expect(painLogEntries(entries).map(e => e.id)).toEqual(["dated", "undated"]);
  });
});

describe("describeCluster", () => {
  it("builds the exact headline shape from the design doc's own example", () => {
    const cluster = { limb: "hand", side: "left", holdType: "crimp", movementStyle: "static", wallAngle: "overhang", count: 5 };
    expect(describeCluster(cluster)).toBe("Your pain flags cluster on left hand crimps, overhang.");
  });

  it("pluralizes pinch as pinches, not pinchs", () => {
    const cluster = { limb: "hand", side: "right", holdType: "pinch", movementStyle: "dynamic", wallAngle: "roof", count: 5 };
    expect(describeCluster(cluster)).toBe("Your pain flags cluster on right hand pinches, roof.");
  });

  it("pluralizes every other hold type with a plain trailing s", () => {
    expect(describeCluster({ limb: "foot", side: "left", holdType: "toe-hook", wallAngle: "slab" })).toBe("Your pain flags cluster on left foot toe-hooks, slab.");
    expect(describeCluster({ limb: "knee", side: "right", holdType: "kneebar", wallAngle: "vert" })).toBe("Your pain flags cluster on right knee kneebars, vert.");
  });
});
```

- [ ] **Step 6: Run the tests, confirm they fail**

Run: `pnpm exec vitest run test/shared/injury-stats.test.js`
Expected: FAIL — `shared/injury-stats.js` doesn't exist yet.

- [ ] **Step 7: Implement `shared/injury-stats.js`**

```js
// #39 (epic #5 Phase 2) -- pure, DOM-free aggregation over entry_pain_moves
// data, following shared/pyramid-stats.js's own precedent for why this
// lives in shared/ rather than client/: server/api/performance.js runs
// this server-side (the design doc's own "online-only" rule for every
// Performance Insight, mirroring how the Grade Pyramid is computed), and
// the same functions are reusable client-side if a future view ever needs
// them without a round-trip.
import { dateRank } from "./date-helpers.js";

// Placeholder threshold (design doc's own "tune once there's real data"
// framing, matching #13's identical placeholder) -- a cluster needs at
// least this many total pain-tags across the user's whole logbook before
// it's presented as a real pattern rather than noise from one or two
// climbs.
export const MIN_TAG_COUNT = 5;

// One "cluster" = one full 5-value combination (limb, side, holdType,
// movementStyle, wallAngle) -- the same five tagging dimensions
// entry_pain_moves rows carry (shared/entry-schema.js's own vocabulary).
// Counts every pain-tagged move across every entry, not just one per
// entry -- a single climb tagging the same combination twice (rare, but
// the data model allows it) counts twice, since each row is a real,
// separate reported pain event.
export function painClusterCounts(entries) {
  const byKey = new Map();
  for (const entry of entries) {
    for (const move of entry.painMoves ?? []) {
      const key = [move.limb, move.side, move.holdType, move.movementStyle, move.wallAngle].join("|");
      const existing = byKey.get(key);
      if (existing) {
        existing.count++;
      } else {
        byKey.set(key, { limb: move.limb, side: move.side, holdType: move.holdType, movementStyle: move.movementStyle, wallAngle: move.wallAngle, count: 1 });
      }
    }
  }
  return [...byKey.values()];
}

// null when nothing clears the confidence gate -- the composition root
// renders a "not enough data yet" state in that case, never a
// false-confidence ranked callout from one or two tags.
export function topPainCluster(entries, minCount = MIN_TAG_COUNT) {
  const eligible = painClusterCounts(entries).filter(c => c.count >= minCount);
  if (eligible.length === 0) return null;
  return eligible.reduce((max, c) => (c.count > max.count ? c : max));
}

// Most-recent-first, same dateRank() a missing/malformed date already
// sorts oldest exactly like every other date-sorted list in this app.
export function painLogEntries(entries) {
  return entries
    .filter(e => (e.painMoves ?? []).length > 0)
    .sort((a, b) => dateRank(b.date) - dateRank(a.date));
}

// Only "pinch" in the current hold-type vocabulary (shared/entry-
// schema.js's HOLD_TYPES_BY_LIMB) needs the "es" branch -- a plain
// trailing "s" is correct for every other current word (crimp, jug,
// pocket, sloper, edge, toe-hook, heel-hook, kneebar). Not a general
// pluralization library -- scoped to what this fixed vocabulary actually
// needs, same "don't build for words that don't exist yet" discipline
// entry-schema.js's own vocabulary comments already follow.
function pluralizeHoldType(holdType) {
  return holdType.endsWith("ch") ? `${holdType}es` : `${holdType}s`;
}

// Structured data in, one prose sentence out -- kept here (not inline in
// the composition root) so it's unit-testable without a DOM, same
// separation shared/pyramid-stats.js models for its own structured-data-
// vs-rendering split.
export function describeCluster(cluster) {
  return `Your pain flags cluster on ${cluster.side} ${cluster.limb} ${pluralizeHoldType(cluster.holdType)}, ${cluster.wallAngle}.`;
}
```

- [ ] **Step 8: Run the tests, confirm they pass**

Run: `pnpm exec vitest run test/shared/injury-stats.test.js`
Expected: PASS (14 tests)

- [ ] **Step 9: Run the full suite to confirm no regressions**

Run: `pnpm test`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add shared/injury-stats.js test/shared/injury-stats.test.js
git commit -m "Add shared/injury-stats.js: pain-cluster confidence-gated ranking + log ordering"
```

---

## Task 2: `server/api/performance.js` — the injury-log endpoint

**Files:**
- Modify: `server/api/performance.js`
- Modify: `server/index.js` (route registration)
- Test: `test/performance.test.js` (existing file — confirm it exists and covers `handleGetPyramid` already; add a new `describe` block for the new handler following that same file's established pattern. If no such file exists, check `test/logbook.test.js`/`test/handlers.test.js` for wherever `handleGetPyramid` is actually tested today and add alongside that instead.)

**Interfaces:**
- Consumes: Task 1's `shared/injury-stats.js` (`painLogEntries`, `topPainCluster`), `server/api/logbook.js`'s already-exported `rowToJson`/`attachChildRows` (unchanged, already used by `handleGetPyramid`'s own `listForUser` call for `rowToJson`; `attachChildRows` is new to this file specifically, since `handleGetPyramid` never needed `painMoves` before).
- Produces: `handleGetInjuryLog(request, env, userId)` → `{ log: Array<entry-with-painMoves>, cluster: {limb,side,holdType,movementStyle,wallAngle,count} | null }`. Registered at `/logbook/api/performance/injury` in `server/index.js`'s `PUBLIC_GET_ROUTES`.

- [ ] **Step 1: Confirm the existing test file/pattern for `handleGetPyramid`**

Run: `grep -rln "handleGetPyramid" test/*.test.js`
Read whichever file this returns in full to confirm its exact fixture/assertion pattern (real HTTP request through the Worker entrypoint vs. direct handler import — match whichever this file already does) before writing Step 3's new tests.

- [ ] **Step 2: Write the failing tests**

Append to the file found in Step 1 (adapt the exact request/assertion syntax to match that file's own established pattern — the test bodies below show the required behavior, not literal copy-paste code):

```js
describe("handleGetInjuryLog", () => {
  it("returns an empty log and null cluster for a user with no pain-tagged entries", async () => {
    await post(validEntry());
    const res = await getInjuryLog();
    const body = await res.json();
    expect(body.log).toEqual([]);
    expect(body.cluster).toBeNull();
  });

  it("includes only entries that have at least one pain move", async () => {
    await post(validEntry());
    await post({ ...validEntry(), name: "Painful Route", painMoves: [{ limb: "hand", side: "left", holdType: "crimp", movementStyle: "static", wallAngle: "overhang" }] });
    const res = await getInjuryLog();
    const { log } = await res.json();
    expect(log).toHaveLength(1);
    expect(log[0].name).toBe("Painful Route");
    expect(log[0].painMoves).toHaveLength(1);
  });

  it("surfaces a cluster once 5 matching pain moves exist across entries", async () => {
    for (let i = 0; i < 5; i++) {
      await post({ ...validEntry(), name: `Route ${i}`, painMoves: [{ limb: "foot", side: "right", holdType: "toe-hook", movementStyle: "dynamic", wallAngle: "slab" }] });
    }
    const res = await getInjuryLog();
    const { cluster } = await res.json();
    expect(cluster).toMatchObject({ limb: "foot", side: "right", holdType: "toe-hook", wallAngle: "slab", count: 5 });
  });

  it("excludes a soft-deleted entry's pain moves from both the log and the cluster count", async () => {
    const created = await (await post({ ...validEntry(), painMoves: [{ limb: "hand", side: "left", holdType: "crimp", movementStyle: "static", wallAngle: "overhang" }] })).json();
    await del(created.entries[0].id);
    const res = await getInjuryLog();
    const body = await res.json();
    expect(body.log).toEqual([]);
    expect(body.cluster).toBeNull();
  });
});
```

Add a thin `getInjuryLog()` request-wrapper matching whatever local convention Step 1's file already uses for its own `handleGetPyramid` tests (e.g. a `get(path, extraCookie)` helper, or a bespoke one-off — mirror it exactly).

- [ ] **Step 3: Run the tests, confirm they fail**

Run: `pnpm exec vitest run <the test file from Step 1> -t "handleGetInjuryLog"`
Expected: FAIL — `handleGetInjuryLog` doesn't exist and isn't routed yet.

- [ ] **Step 4: Implement `handleGetInjuryLog`**

In `server/api/performance.js`, add the new imports and handler:

```js
import { json } from "../lib/json.js";
import { listForUser } from "../lib/d1-resource.js";
import { attachChildRows, rowToJson } from "./logbook.js";
import { pyramidSplitRows } from "../../shared/pyramid-stats.js";
import { painLogEntries, topPainCluster } from "../../shared/injury-stats.js";

// (existing handleGetPyramid stays exactly as-is above this)

// #39 -- same online-only, computed-server-side convention as
// handleGetPyramid above: attachChildRows() is what actually needed
// adding here (handleGetPyramid never called it -- the pyramid doesn't
// need painMoves), everything else follows that function's own established
// shape exactly.
export async function handleGetInjuryLog(request, env, userId) {
  const rows = await listForUser(env, "entries", userId, rowToJson, { excludeDeleted: true });
  const entries = await attachChildRows(rows, env);
  return json({
    log: painLogEntries(entries),
    cluster: topPainCluster(entries),
  }, 200, { "Cache-Control": "no-store" });
}
```

Update `server/index.js`'s imports (currently `import { handleGetPyramid } from "./api/performance.js";`):

```js
import { handleGetInjuryLog, handleGetPyramid } from "./api/performance.js";
```

Add the route to `PUBLIC_GET_ROUTES`, directly after the existing pyramid entry:

```js
  "/logbook/api/performance/pyramid": handleGetPyramid,
  // #39 -- same public-GET + server-side-computed convention as the
  // pyramid route above; /performance/injury itself is owner-only in
  // practice (owned-routes.js gates the page).
  "/logbook/api/performance/injury": handleGetInjuryLog,
```

- [ ] **Step 5: Run the tests, confirm they pass**

Run: `pnpm exec vitest run <the test file from Step 1> -t "handleGetInjuryLog"`
Expected: PASS (4 tests)

- [ ] **Step 6: Run the full suite to confirm no regressions**

Run: `pnpm test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add server/api/performance.js server/index.js <the test file from Step 1>
git commit -m "Add the /performance/injury endpoint (#39)"
```

---

## Task 3: Route plumbing — hub tile, shell, composition-root boilerplate

**Files:**
- Create: `public/performance/injury/index.html`
- Create: `client/performance-injury-main.js`
- Modify: `client/performance-hub-main.js` (add to `INSIGHTS`)
- Modify: `server/api/owned-routes.js` (add to `SHELL_PATHS`)
- Modify: `server/index.js` (extend the owned-route regex, both occurrences)
- Modify: `package.json` (new `performance-injury:build`/`:watch` scripts, `pages:build`, `dev:raw`/`dev:vite`, `e2e:build-fixtures`)
- Modify: `scripts/dev.mjs` (add to the `-n`/`-c`/command lists)
- Modify: `.gitignore` (new bundle-output entry)
- Test: `test/owned-routes.test.js` (new shell-serving test, following the existing `/performance/pyramid` test's exact two-assertion pattern)

**Interfaces:**
- Consumes: Task 2's `/logbook/api/performance/injury` endpoint.
- Produces: a real, navigable `/:username/performance/injury` route. Task 4 fills in this composition root's actual rendering logic (currently a placeholder shell in this task — see Step 5's note on what Task 4 replaces).

- [ ] **Step 1: Add the hub tile**

In `client/performance-hub-main.js`, add to the `INSIGHTS` array (after the existing pyramid entry):

```js
const INSIGHTS = [
  {
    id: "insight-pyramid",
    title: "Grade Pyramid",
    description: "See your sends broken down by grade, and how your pyramid's shape has changed over time.",
    route: "pyramid",
  },
  {
    id: "insight-injury",
    title: "Injury / Pain Log",
    description: "Browse every climb where something hurt, and see which moves your pain flags cluster around.",
    route: "injury",
  },
];
```

- [ ] **Step 2: Register the shell path and extend the owned-route regex**

In `server/api/owned-routes.js`, add to `SHELL_PATHS` (directly after the existing `"performance/pyramid"` entry):

```js
  "performance/pyramid": "/performance/pyramid/index.html",
  "performance/injury": "/performance/injury/index.html",
```

In `server/index.js`, change **both** occurrences of the owned-route regex (currently `performance(?:\/pyramid)?`) to:

```js
performance(?:\/(?:pyramid|injury))?
```

Full regex context (both occurrences, identical):

```js
const ownedRouteMatch = pathname.match(/^\/([^/]+)\/(log|map|performance(?:\/(?:pyramid|injury))?|sync|account(?:\/edit|\/import)?)\/?$/);
```

- [ ] **Step 3: Create the static shell**

Create `public/performance/injury/index.html` — copy `public/performance/pyramid/index.html` verbatim, then make exactly these changes: `<title>` becomes `Injury / Pain Log – Climbing Logbook`, remove the `<climbing-grade-pyramid>` element and its preceding comment, replace the `#performance-offline` message's body text (both `<p>` tags) with the same "Performance insights need a connection." / "Reconnect and reload this page to see your injury/pain log." pair (keep the `id="performance-offline"` element itself, same `hidden` attribute, same `row-card text-center max-w-[420px] mx-auto` classes — this view is online-only same as the pyramid, per this plan's Global Constraints), add a new empty container `<div id="injury-log-root"></div>` where `<climbing-grade-pyramid>` used to be, and change the closing `<script>` tag's `src` to `/logbook/performance-injury-app.js`.

- [ ] **Step 4: Create the composition root skeleton**

Create `client/performance-injury-main.js` — copy `client/performance-pyramid-main.js` verbatim as a starting point, then make these changes: remove the `import "./components/climbing-grade-pyramid.js";` import (this view has no custom element), rename `PYRAMID_URL` to `INJURY_URL = "/logbook/api/performance/injury"`, rename `fetchPyramid` to `fetchInjuryLog`, remove `pyramidEl`/its `document.querySelector("climbing-grade-pyramid")` line and replace it with `const injuryRootEl = document.getElementById("injury-log-root");`, remove the `pyramidEl.activeDiscipline = store.getActiveType();` line inside `render()` (this view has no discipline split — pain moves aren't discipline-scoped), remove the `resetPyramidExpansion: () => pyramidEl.resetExpansion(),` line from the `createHeaderChrome({...})` call and replace it with `resetPyramidExpansion: () => {},` (same no-op reasoning `performance-hub-main.js` already uses — this view renders no pyramid, but the callback must still exist or the discipline-picker's click handler throws, per `header-chrome.js:68`'s unconditional call), change `store.setActiveView("pyramid")` to `store.setActiveView("performance-injury")`, and in `boot()`'s try/catch, replace `pyramidEl.pyramidData = await fetchPyramid();` / `offlineEl.hidden = true; pyramidEl.hidden = false;` / `offlineEl.hidden = false; pyramidEl.hidden = true;` with a call to a new (currently empty) `renderInjuryLog(data)` function — Task 4 fills this in; for this task, stub it as:

```js
function renderInjuryLog(data) {
  // Task 4 fills this in.
  injuryRootEl.textContent = JSON.stringify(data);
}
```

and the `boot()` try/catch body becomes:

```js
  try {
    const data = await fetchInjuryLog();
    offlineEl.hidden = true;
    injuryRootEl.hidden = false;
    renderInjuryLog(data);
  } catch {
    offlineEl.hidden = false;
    injuryRootEl.hidden = true;
  }
```

- [ ] **Step 5: Add build scripts**

In `package.json`'s `scripts`, add directly after the existing `performance-pyramid:build`/`:watch` pair:

```json
    "performance-injury:build": "esbuild client/performance-injury-main.js --bundle --format=esm --outfile=public/logbook/performance-injury-app.js --minify --external:./escape-html.js --external:./floating-ui-dom.js",
    "performance-injury:watch": "esbuild client/performance-injury-main.js --bundle --format=esm --outfile=public/logbook/performance-injury-app.js --watch --external:./escape-html.js --external:./floating-ui-dom.js",
```

Add `pnpm run performance-injury:build` to the `pages:build` chain, directly after `pnpm run performance-hub:build`.

Change `dev:raw` (inserting `performance-injury` after `performance-hub` in both the `-n` and `-c` lists — the `-c` list's repeating 6-color cycle, `blue,magenta,yellow,cyan,white,gray`, shifts by one position for everything after the insertion point, so every color from `log` onward moves one slot down the cycle):

```json
"dev:raw": "concurrently -n wrangler,tailwind,map,performance-pyramid,performance-hub,performance-injury,log,profile,account,account-edit,account-import,sync,beta-gate -c blue,magenta,yellow,cyan,white,gray,blue,magenta,yellow,cyan,white,gray,blue \"wrangler dev\" \"tailwindcss -i ./styles/tailwind.css -o ./public/logbook/tailwind.css --watch\" \"pnpm run map:watch\" \"pnpm run performance-pyramid:watch\" \"pnpm run performance-hub:watch\" \"pnpm run performance-injury:watch\" \"pnpm run log:watch\" \"pnpm run profile:watch\" \"pnpm run account:watch\" \"pnpm run account-edit:watch\" \"pnpm run account-import:watch\" \"pnpm run sync:watch\" \"pnpm run beta-gate:watch\"",
```

Change `dev:vite` the same way (only the `-n` list's first entry and the first quoted command differ, `vite`/`"vite dev"` instead of `wrangler`/`"wrangler dev"` — everything else identical to `dev:raw` above):

```json
"dev:vite": "concurrently -n vite,tailwind,map,performance-pyramid,performance-hub,performance-injury,log,profile,account,account-edit,account-import,sync,beta-gate -c blue,magenta,yellow,cyan,white,gray,blue,magenta,yellow,cyan,white,gray,blue \"vite dev\" \"tailwindcss -i ./styles/tailwind.css -o ./public/logbook/tailwind.css --watch\" \"pnpm run map:watch\" \"pnpm run performance-pyramid:watch\" \"pnpm run performance-hub:watch\" \"pnpm run performance-injury:watch\" \"pnpm run log:watch\" \"pnpm run profile:watch\" \"pnpm run account:watch\" \"pnpm run account-edit:watch\" \"pnpm run account-import:watch\" \"pnpm run sync:watch\" \"pnpm run beta-gate:watch\"",
```

In `scripts/dev.mjs`, change the `-n`/`-c` lists and the spawn args array (this file has no `beta-gate` entry at all — a pre-existing, already-accepted drift from `package.json`'s own lists, not something this task fixes):

```js
  "-n", "vite,tailwind,map,performance-pyramid,performance-hub,performance-injury,log,profile,account,account-edit,account-import,sync",
  "-c", "blue,magenta,yellow,cyan,white,gray,blue,magenta,yellow,cyan,white,gray",
  "vite dev",
  "tailwindcss -i ./styles/tailwind.css -o ./public/logbook/tailwind.css --watch",
  "pnpm run map:watch",
  "pnpm run performance-pyramid:watch",
  "pnpm run performance-hub:watch",
  "pnpm run performance-injury:watch",
  "pnpm run log:watch",
  "pnpm run profile:watch",
  "pnpm run account:watch",
  "pnpm run account-edit:watch",
  "pnpm run account-import:watch",
  "pnpm run sync:watch",
```

- [ ] **Step 6: Update `.gitignore` and `e2e:build-fixtures`**

In `.gitignore`, add directly after the existing `public/logbook/performance-hub-app.js` line:

```
public/logbook/performance-injury-app.js
```

In `package.json`'s `e2e:build-fixtures` script, add a new esbuild clause for the fixture bundle and a new `cp` clause for the fixture page, following the exact pattern the existing `performance.html`/`performance-pyramid.html` clauses already use — bundle `client/performance-injury-main.js` to `public/e2e-fixtures/performance-injury.js` (no `--external` flags needed beyond the standard `--external:./escape-html.js` every other fixture bundle already uses), and copy `public/performance/injury/index.html` to `public/e2e-fixtures/pages/performance-injury.html`.

- [ ] **Step 7: Write the failing shell-serving test**

In `test/owned-routes.test.js`, add directly after the existing `"serves the real static shell for performance/pyramid"` test:

```js
  it("serves the real static shell for performance/injury", async () => {
    const { cookie } = await createAuthedSession({ username: "injuryshelluser", hostname: "climbinglogbook.com" });
    const res = await fetchOwnedRoute("injuryshelluser", "performance/injury", { cookie });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('id="injury-log-root"');
    expect(html).toContain('src="/logbook/performance-injury-app.js"');
  });
```

- [ ] **Step 8: Run the test, confirm it fails**

Run: `pnpm exec vitest run test/owned-routes.test.js -t "performance/injury"`
Expected: FAIL — the shell/route doesn't exist until the steps above are actually saved to disk (if run after Steps 1-6, this instead confirms the plumbing already works — run this step's tests only after those file changes are in place, then treat "already passing" as this step's own green result, same as any other step where earlier work already satisfied a later assertion).

- [ ] **Step 9: Run the test, confirm it passes**

Run: `pnpm exec vitest run test/owned-routes.test.js -t "performance/injury"`
Expected: PASS

- [ ] **Step 10: Run the full unit suite**

Run: `pnpm test`
Expected: PASS

- [ ] **Step 11: Commit**

```bash
git add client/performance-hub-main.js client/performance-injury-main.js public/performance/injury/index.html server/api/owned-routes.js server/index.js package.json scripts/dev.mjs .gitignore test/owned-routes.test.js
git commit -m "Wire up the /performance/injury route (#39): hub tile, shell, composition root skeleton"
```

---

## Task 4: The actual log UI + ranked-callout headline

**Files:**
- Modify: `client/performance-injury-main.js` (replace Task 3's `renderInjuryLog` stub)
- Test: manual verification (this task is pure DOM-rendering logic operating on already-tested data from Tasks 1-2 — no new pure-logic unit tests needed here; e2e coverage is Task 5)

**Interfaces:**
- Consumes: Task 2's endpoint response shape (`{log, cluster}`), Task 1's `describeCluster` (imported directly into the composition root for the headline).

- [ ] **Step 1: Implement the real `renderInjuryLog`**

In `client/performance-injury-main.js`, add the import:

```js
import { describeCluster } from "../shared/injury-stats.js";
import { escapeHtml } from "./escape-html.js";
import { formatDate } from "../shared/date-helpers.js";
```

Replace Task 3's stub `renderInjuryLog` with:

```js
function logRowHtml(entry) {
  const moves = entry.painMoves
    .map(m => `${escapeHtml(m.side)} ${escapeHtml(m.limb)} ${escapeHtml(m.holdType)}`)
    .join(", ");
  return `<div class="row-card" id="injury-log-${escapeHtml(entry.id)}">
    <span class="row-card-title">${escapeHtml(entry.name)}</span>
    <p class="text-[.82rem] text-muted mt-1">${escapeHtml(formatDate(entry.date))}</p>
    <p class="text-[.82rem] text-foreground mt-1">${moves}</p>
  </div>`;
}

// No evidence-tier chip here (unlike the pyramid's citations/evidence
// overlays) -- design doc's own explicit call: this is the app's own data
// overlay, not a sourced external claim. The caveat line below is
// required regardless of that, though -- research doc's own framing
// ("a pattern-noticing tool, not medical advice") applies to the whole
// view, not just the headline, so it's rendered unconditionally, not only
// alongside a cluster.
const CAVEAT_HTML = `<p class="text-[.75rem] text-muted mb-3" id="injury-caveat">A pattern-noticing tool, not medical advice.</p>`;

function renderInjuryLog({ log, cluster }) {
  const headlineHtml = cluster
    ? `<p class="text-[.95rem] font-semibold text-foreground mb-4" id="injury-headline">${escapeHtml(describeCluster(cluster))}</p>`
    : `<p class="text-[.85rem] text-muted mb-4" id="injury-headline">Not enough data yet to spot a pattern -- keep tagging pain moves as they come up.</p>`;

  const logHtml = log.length
    ? `<div class="flex flex-col gap-2" id="injury-log-list">${log.map(logRowHtml).join("")}</div>`
    : `<p class="text-[.85rem] text-muted" id="injury-log-empty">No pain flags logged yet. This is a good thing.</p>`;

  injuryRootEl.innerHTML = CAVEAT_HTML + headlineHtml + logHtml;
}
```

- [ ] **Step 2: Manual verification**

Run: `pnpm dev`, log in, navigate to `/performance/injury`.
Expected: with no pain-tagged entries, shows the "Not enough data yet" message and "No pain flags logged yet" empty state. Add 5 entries each tagging the same pain-move combination (e.g. Left Hand, crimp, static, overhang) via the entry form's Pain/injury section (#584/#585), reload — the headline now reads "Your pain flags cluster on left hand crimps, overhang." and the log lists all 5 entries, most recent first.

- [ ] **Step 3: Run the full unit suite to confirm no regressions**

Run: `pnpm test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add client/performance-injury-main.js
git commit -m "Render the injury/pain log UI and ranked-cluster headline (#39)"
```

---

## Task 5: End-to-end coverage

**Files:**
- Create: `e2e/performance-injury-page.spec.js` (new file, following `e2e/performance-pyramid-page.spec.js`'s exact established pattern — `mockApi()`, fixture-harness page, real composition root)
- Test: itself

**Interfaces:**
- Consumes: the full Task 1-4 stack, end-to-end, through the real UI and a mocked `/logbook/api/*`.

- [ ] **Step 1: Read `e2e/performance-pyramid-page.spec.js` in full to confirm its exact `mockApi()`/fixture-harness pattern**

This file (already read during this session's own grounding pass) uses: `mockApi(page, { settings: {...}, pyramidData: {...} })`, `page.goto("/e2e-fixtures/pages/performance-pyramid.html")`, and a second test overriding the fetch via `page.route("**/logbook/api/performance/pyramid", route => route.fulfill({status: 500}))` for the offline-message case. Confirm `mockApi()`'s own signature (`e2e/mock-api.js`) supports an arbitrary extra fixture option the same way `pyramidData` does, or whether this view's data needs to be injected via a direct `page.route()` override instead (mirroring the `pyramidData` option if `mockApi()` has one, or adding a same-shaped one if it's easy and matches that file's own established extension pattern — do not invent a structurally different mocking approach for this one view).

- [ ] **Step 2: Write the failing e2e tests**

Create `e2e/performance-injury-page.spec.js` (adapt exact mocking syntax to match Step 1's findings):

```js
// #39 (epic #5 Phase 2) -- composition-root-wiring coverage for
// /:username/performance/injury, same fixture-harness pattern as
// e2e/performance-pyramid-page.spec.js (see that file's own header
// comment). athleteMode: true is required in the mocked settings response
// -- client/performance-injury-main.js redirects to /log otherwise
// (#151's rule).
import { expect, test } from "@playwright/test";
import { mockApi } from "./mock-api.js";

test("shows the not-enough-data message and empty log with no pain-tagged entries", async ({ page }) => {
  await mockApi(page, {
    settings: { athleteMode: true, activeDiscipline: "boulder" },
    injuryData: { log: [], cluster: null },
  });
  await page.goto("/e2e-fixtures/pages/performance-injury.html");

  await expect(page.locator("climbing-header h1")).toHaveText("Climbing Logbook");
  await expect(page.locator("climbing-tab-bar a", { hasText: "Performance Insights" })).toHaveAttribute("aria-current", "page");
  await expect(page.locator("#injury-headline")).toContainText("Not enough data yet");
  await expect(page.locator("#injury-log-empty")).toBeVisible();
});

test("renders the ranked headline and log rows when a cluster clears the confidence gate", async ({ page }) => {
  await mockApi(page, {
    settings: { athleteMode: true, activeDiscipline: "boulder" },
    injuryData: {
      log: [{ id: "e1", name: "Painful Route", date: "2026-01-01", painMoves: [{ limb: "hand", side: "left", holdType: "crimp", movementStyle: "static", wallAngle: "overhang" }] }],
      cluster: { limb: "hand", side: "left", holdType: "crimp", movementStyle: "static", wallAngle: "overhang", count: 5 },
    },
  });
  await page.goto("/e2e-fixtures/pages/performance-injury.html");

  await expect(page.locator("#injury-headline")).toHaveText("Your pain flags cluster on left hand crimps, overhang.");
  await expect(page.locator("#injury-log-list .row-card-title")).toHaveText("Painful Route");
});

test("shows the offline message instead of the log when the fetch fails", async ({ page }) => {
  await mockApi(page, { settings: { athleteMode: true, activeDiscipline: "boulder" } });
  await page.route("**/logbook/api/performance/injury", route => route.fulfill({ status: 500 }));
  await page.goto("/e2e-fixtures/pages/performance-injury.html");

  await expect(page.locator("#performance-offline")).toBeVisible();
  await expect(page.locator("#injury-log-root")).toBeHidden();
});

test("redirects to /log when Athlete Mode is off", async ({ page }) => {
  await mockApi(page, { settings: { athleteMode: false, activeDiscipline: "boulder" } });
  await page.goto("/e2e-fixtures/pages/performance-injury.html");

  await page.waitForURL(/\/log$/);
});
```

- [ ] **Step 3: Run the tests, confirm they fail**

Run: `pnpm run e2e:build-fixtures && pnpm exec playwright test e2e/performance-injury-page.spec.js`
Expected: FAIL until the fixture-building/mocking wiring from Step 1's investigation is correctly connected — fix any mismatch between `mockApi()`'s real signature and this test's assumptions before treating this as a real product-code failure.

- [ ] **Step 4: Fix any real issues, re-run until green**

Run: `pnpm exec playwright test e2e/performance-injury-page.spec.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Run the full e2e suite twice**

Run: `pnpm exec playwright test` (twice)
Expected: PASS both times.

- [ ] **Step 6: Run the full unit suite one final time**

Run: `pnpm test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add e2e/performance-injury-page.spec.js
git commit -m "Add e2e coverage for the injury/pain log view (#39)"
```

---

## Final Verification

- [ ] `pnpm test` — full pass
- [ ] `pnpm exec playwright test` — full pass, twice
- [ ] Manual: `pnpm dev`, log in via `http://my.localhost:<port>/login/` (NOT plain `localhost` -- see this session's own established lesson on the preview tool's cwd), add 5 entries tagging the identical pain-move combination via the entry form, navigate to `/performance/injury`, confirm the ranked headline and log render correctly; add a 6th entry with a different pain-move combination and confirm it appears in the log without changing the headline's cluster (5 vs. 1, the 5-cluster still wins).
- [ ] Confirm the hub page (`/performance`) now shows two tiles (Grade Pyramid, Injury / Pain Log), and the new tile's "View" link navigates to `/performance/injury`.
- [ ] Confirm `git log --oneline` shows 5 task commits, each independently reviewable.
