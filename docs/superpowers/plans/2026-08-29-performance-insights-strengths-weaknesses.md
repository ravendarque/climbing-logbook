# Performance Insights: Strengths/Weaknesses Breakdown (#13) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `/:username/performance/strengths` — an auto-surfaced "your weakest combination" headline plus an interactive single-dimension drill-down, ranking `entry_moves` tag combinations by "hardest share" — the third of epic #5's five remaining Phase 2 views.

**Architecture:** Server-side aggregation (`shared/strengths-stats.js`, mirroring `shared/injury-stats.js`'s exact precedent from #39) computed in a new `handleGetStrengthsWeaknesses` handler (`server/api/performance.js`, same file, same convention as `handleGetPyramid`/`handleGetInjuryLog`). One endpoint, two response shapes: no query params returns the auto-surfaced headline + the list of pickable drill-down anchors; `?dimension=X&value=Y` returns the ranked list for that anchor, mirroring how `server/api/logbook.js`'s own `handleGet` already branches on query params for different computed shapes. A new composition root (`client/performance-strengths-main.js`) follows `client/performance-injury-main.js`'s exact boot/render/redirect pattern.

**Tech Stack:** Cloudflare Workers + D1, Vitest, Playwright, esbuild, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-08-27-performance-insights-ui-design.md` — "#13 strengths/weaknesses: interaction design" section. Also `docs/climbing-analytics-research.md` §6 and issue #13's own GitHub body (both consistent with the spec doc, no additional pinned specifics).

## Global Constraints

- **No coaching-heuristic overlay in this plan.** The design doc's "Coaching-heuristic overlay" bullet is real future scope, but epic #5's own body is explicit: "#579 — author #13's coaching-heuristic suggestion content (blocks #13's suggestion overlay only, not its core ranked headline/drill-down)." #579 hasn't been picked up yet, so this plan ships the core ranked headline/drill-down with **no** suggestion-overlay UI or lookup-table hook point at all — not a stub, not a placeholder, genuinely absent. Adding it is #579's own future plan's job.
- **Ranking score**: per combination-cell (`limb`, `side`, `holdType`, `movementStyle`, `wallAngle`), `score = hardestCount / (hardestCount + easiestCount)` — a "hardest share." Higher score = weaker (more often tagged as the hardest part of a climb).
- **Confidence gate: minimum 5 total tags** (`hardestCount + easiestCount >= 5`) for a cell to be ranked at all — same placeholder threshold #39 already used (`shared/injury-stats.js`'s `MIN_TAG_COUNT`), matching the design doc's own explicit cross-reference between the two views' confidence-gate approach.
- **Default view — auto-surfaced headline, no picking required.** The single highest-scoring cell that clears the gate, stated in plain language: `"Your {side} {limb} on {wall-angle adjective} {holdType}s looks like a key weakness."` — the design doc's own literal example is `"Your left hand on overhanging crimps looks like a key weakness"`, which this exact template produces for `{side: "left", limb: "hand", wallAngle: "overhang", holdType: "crimp"}`.
- **Ruling — wall-angle adjective mapping**: `slab → "slab"`, `vert → "vertical"`, `overhang → "overhanging"`, `roof → "roof"` (the design doc only gives one worked example; these four are the plan-author's own reading of natural English for each of the four fixed wall-angle values, not a spec-mandated mapping).
- **Ruling — hold-type pluralization**: identical rule to #39's `shared/injury-stats.js` (`pinch → pinches`, everything else `+s`) — the same fixed vocabulary, the same edge case, reimplemented in `shared/strengths-stats.js` rather than importing #39's copy, since the two modules are otherwise independent and this is a two-line function, not worth a cross-module dependency for.
- **Drill-down — single-dimension anchor, one flattened picker.** The design doc says "the user picks any *one* dimension value... to anchor on" — read literally as a single selection from the flattened union of every possible value across all four dimensions (6 limb+side combinations, 9 hold types, 3 movement styles, 4 wall angles — 22 total possible anchors, though only ones actually present in the user's own tagged data are ever offered), not a two-step "pick a dimension, then pick a value within it" UI. Selecting an anchor ranks every combination of the *other three* dimensions for that fixed value, weakest first.
- **Multi-dimension anchoring is out of scope for v1** (design doc's own explicit statement) — the picker only ever fixes one value at a time.
- **`entries.deleted_at IS NULL` filtering is already handled for free** — this plan's new handler reuses `listForUser(env, "entries", userId, rowToJson, {excludeDeleted: true})`, the same call `handleGetPyramid`/`handleGetInjuryLog` already make.
- **Security**: per #584/#585's own lesson (a public endpoint leaking new sensitive fields via handler reuse) and #39's own final review (which specifically re-checked for and ruled out the same class of bug), this plan's new endpoint must be verified NOT reachable through `server/api/public-data.js`'s reuse mechanism — confirm at final review, same as #39's own final review did.
- **Test commands**: `pnpm test` (Vitest), `pnpm exec playwright test` (Playwright, run twice for idempotency).
- **Deploy classification: beta-only, no migrations touched** (`entry_moves` already exists from Phase 1). Per Raven's explicit instruction this session, do **not** run `promote.yml` after merge — leave this on beta same as the prior three deliverables in this epic.

---

## Task 1: `shared/strengths-stats.js` — pure ranking/confidence-gate/anchor logic

**Files:**
- Create: `shared/strengths-stats.js`
- Test: `test/shared/strengths-stats.test.js`

**Interfaces:**
- Consumes: `shared/entry-schema.js`'s `HOLD_TYPES_BY_LIMB`, `MOVEMENT_STYLES_BY_LIMB` (already exist, `#584`) — used to build the flattened union vocabulary for anchors.
- Produces: `MIN_TAG_COUNT` (= `5`), `cellCounts(entries)` → `Array<{limb, side, holdType, movementStyle, wallAngle, hardestCount, easiestCount, total, score}>`, `rankedCells(entries, minCount = MIN_TAG_COUNT)` → the same shape, filtered to `total >= minCount`, sorted by `score` descending, `topWeakness(entries, minCount)` → the single highest-scoring cell or `null`, `availableAnchors(entries)` → `Array<{dimension, value, label}>` (only values actually present in the data), `rankedForAnchor(entries, dimension, value, minCount)` → ranked cells matching that one fixed dimension/value, `describeWeakness(cell)` → the headline sentence string.

- [ ] **Step 1: Write the failing tests**

Create `test/shared/strengths-stats.test.js`:

```js
import { describe, expect, it } from "vitest";
import { MIN_TAG_COUNT, availableAnchors, cellCounts, describeWeakness, rankedCells, rankedForAnchor, topWeakness } from "../../shared/strengths-stats.js";

function entryWithMoves(moves = [], overrides = {}) {
  return { id: "e1", name: "Test Route", moves, ...overrides };
}
function moveRow(overrides = {}) {
  return { difficulty: "hardest", limb: "hand", side: "left", holdType: "crimp", movementStyle: "static", wallAngle: "overhang", ...overrides };
}

describe("cellCounts", () => {
  it("returns an empty array for entries with no moves", () => {
    expect(cellCounts([entryWithMoves()])).toEqual([]);
  });

  it("counts hardest and easiest separately within one cell", () => {
    const cells = cellCounts([entryWithMoves([moveRow({ difficulty: "hardest" }), moveRow({ difficulty: "easiest" })])]);
    expect(cells).toHaveLength(1);
    expect(cells[0]).toMatchObject({ hardestCount: 1, easiestCount: 1, total: 2, score: 0.5 });
  });

  it("keeps different combinations as separate cells", () => {
    const cells = cellCounts([entryWithMoves([
      moveRow(),
      moveRow({ limb: "foot", side: "right", holdType: "toe-hook", movementStyle: "dynamic", wallAngle: "slab" }),
    ])]);
    expect(cells).toHaveLength(2);
  });

  it("sums counts for the same combination across multiple entries", () => {
    const cells = cellCounts([
      entryWithMoves([moveRow()], { id: "e1" }),
      entryWithMoves([moveRow()], { id: "e2" }),
    ]);
    expect(cells).toHaveLength(1);
    expect(cells[0].total).toBe(2);
  });
});

describe("rankedCells / topWeakness", () => {
  it("excludes cells below the confidence gate", () => {
    const entries = [entryWithMoves([moveRow()])]; // total = 1
    expect(rankedCells(entries)).toEqual([]);
    expect(topWeakness(entries)).toBeNull();
  });

  it("includes and ranks cells at or above the gate, highest score first", () => {
    const weak = Array.from({ length: MIN_TAG_COUNT }, () => moveRow({ difficulty: "hardest" })); // score 1.0
    const strong = Array.from({ length: MIN_TAG_COUNT }, () => moveRow({ difficulty: "easiest", wallAngle: "slab" })); // score 0
    const entries = [entryWithMoves([...weak, ...strong])];
    const ranked = rankedCells(entries);
    expect(ranked).toHaveLength(2);
    expect(ranked[0].wallAngle).toBe("overhang");
    expect(ranked[0].score).toBe(1);
    expect(ranked[1].wallAngle).toBe("slab");
  });

  it("topWeakness returns the single highest-scoring cell", () => {
    const weak = Array.from({ length: MIN_TAG_COUNT }, () => moveRow({ difficulty: "hardest" }));
    const entries = [entryWithMoves(weak)];
    expect(topWeakness(entries)).toMatchObject({ limb: "hand", side: "left", holdType: "crimp", score: 1 });
  });

  it("respects a custom minCount argument", () => {
    const entries = [entryWithMoves([moveRow(), moveRow({ difficulty: "easiest" })])]; // total = 2
    expect(rankedCells(entries, 2)).toHaveLength(1);
    expect(rankedCells(entries, 3)).toHaveLength(0);
  });
});

describe("availableAnchors", () => {
  it("returns an empty array with no tagged moves", () => {
    expect(availableAnchors([entryWithMoves()])).toEqual([]);
  });

  it("returns one anchor per dimension for a single tagged move, deduplicated across entries", () => {
    const entries = [
      entryWithMoves([moveRow()], { id: "e1" }),
      entryWithMoves([moveRow()], { id: "e2" }), // same combination again
    ];
    const anchors = availableAnchors(entries);
    expect(anchors).toHaveLength(4); // limbSide, holdType, movementStyle, wallAngle -- deduplicated
    expect(anchors).toContainEqual({ dimension: "limbSide", value: "hand-left", label: "Left Hand" });
    expect(anchors).toContainEqual({ dimension: "holdType", value: "crimp", label: "crimp" });
    expect(anchors).toContainEqual({ dimension: "movementStyle", value: "static", label: "static" });
    expect(anchors).toContainEqual({ dimension: "wallAngle", value: "overhang", label: "overhang" });
  });

  it("never offers an anchor value that doesn't appear in the data", () => {
    const anchors = availableAnchors([entryWithMoves([moveRow()])]);
    expect(anchors.some(a => a.dimension === "holdType" && a.value === "jug")).toBe(false);
  });
});

describe("rankedForAnchor", () => {
  it("only includes cells matching the fixed dimension/value", () => {
    const matching = Array.from({ length: MIN_TAG_COUNT }, () => moveRow({ holdType: "crimp" }));
    const nonMatching = Array.from({ length: MIN_TAG_COUNT }, () => moveRow({ holdType: "jug", difficulty: "easiest" }));
    const entries = [entryWithMoves([...matching, ...nonMatching])];
    const ranked = rankedForAnchor(entries, "holdType", "crimp");
    expect(ranked).toHaveLength(1);
    expect(ranked[0].holdType).toBe("crimp");
  });

  it("matches on the limbSide dimension using the combined limb-side value", () => {
    const entries = [entryWithMoves(Array.from({ length: MIN_TAG_COUNT }, () => moveRow({ limb: "foot", side: "right" })))];
    const ranked = rankedForAnchor(entries, "limbSide", "foot-right");
    expect(ranked).toHaveLength(1);
  });

  it("still applies the confidence gate within the anchored subset", () => {
    const entries = [entryWithMoves([moveRow({ holdType: "crimp" })])]; // total = 1, below gate
    expect(rankedForAnchor(entries, "holdType", "crimp")).toEqual([]);
  });
});

describe("describeWeakness", () => {
  it("builds the exact headline from the design doc's own example", () => {
    const cell = { limb: "hand", side: "left", holdType: "crimp", movementStyle: "static", wallAngle: "overhang" };
    expect(describeWeakness(cell)).toBe("Your left hand on overhanging crimps looks like a key weakness.");
  });

  it("pluralizes pinch as pinches, not pinchs", () => {
    const cell = { limb: "hand", side: "right", holdType: "pinch", movementStyle: "dynamic", wallAngle: "roof" };
    expect(describeWeakness(cell)).toBe("Your right hand on roof pinches looks like a key weakness.");
  });

  it("uses the correct adjective for every wall angle", () => {
    expect(describeWeakness({ limb: "foot", side: "left", holdType: "toe-hook", wallAngle: "slab" })).toBe("Your left foot on slab toe-hooks looks like a key weakness.");
    expect(describeWeakness({ limb: "knee", side: "right", holdType: "kneebar", wallAngle: "vert" })).toBe("Your right knee on vertical kneebars looks like a key weakness.");
  });
});
```

- [ ] **Step 2: Run the tests, confirm they fail**

Run: `pnpm exec vitest run test/shared/strengths-stats.test.js`
Expected: FAIL — `shared/strengths-stats.js` doesn't exist yet.

- [ ] **Step 3: Implement `shared/strengths-stats.js`**

```js
// #13 (epic #5 Phase 2) -- pure, DOM-free aggregation over entry_moves
// data, following shared/injury-stats.js's own precedent from #39 (which
// itself follows shared/pyramid-stats.js's): server/api/performance.js
// runs this server-side (this epic's own "online-only" convention).
import { HOLD_TYPES_BY_LIMB, MOVEMENT_STYLES_BY_LIMB } from "./entry-schema.js";

// Placeholder threshold, same value and same reasoning as #39's own
// shared/injury-stats.js -- "tune once there's real data" per the design
// doc, not re-derived independently here.
export const MIN_TAG_COUNT = 5;

// Flattened union across every limb -- an anchor value (e.g. "crimp") can
// appear on entries tagged under any limb that offers it, so the anchor
// vocabulary isn't scoped to one limb's own subset the way the entry
// form's cascading dropdowns are.
const ALL_HOLD_TYPES = [...new Set(Object.values(HOLD_TYPES_BY_LIMB).flat())];
const ALL_MOVEMENT_STYLES = [...new Set(Object.values(MOVEMENT_STYLES_BY_LIMB).flat())];

function cellKey(move) {
  return [move.limb, move.side, move.holdType, move.movementStyle, move.wallAngle].join("|");
}

// One "cell" = one full 5-value combination (limb, side, holdType,
// movementStyle, wallAngle) -- the same five tagging dimensions
// entry_moves rows carry. hardestCount/easiestCount track the two
// difficulty buckets separately so the score (hardest share) can be
// derived; total is their sum, the value the confidence gate checks.
export function cellCounts(entries) {
  const byKey = new Map();
  for (const entry of entries) {
    for (const move of entry.moves ?? []) {
      const key = cellKey(move);
      const existing = byKey.get(key);
      if (existing) {
        if (move.difficulty === "hardest") existing.hardestCount++;
        else existing.easiestCount++;
      } else {
        byKey.set(key, {
          limb: move.limb, side: move.side, holdType: move.holdType, movementStyle: move.movementStyle, wallAngle: move.wallAngle,
          hardestCount: move.difficulty === "hardest" ? 1 : 0,
          easiestCount: move.difficulty === "easiest" ? 1 : 0,
        });
      }
    }
  }
  return [...byKey.values()].map(c => ({
    ...c,
    total: c.hardestCount + c.easiestCount,
    score: c.hardestCount / (c.hardestCount + c.easiestCount),
  }));
}

// Weakest (highest hardest-share) first. Cells below MIN_TAG_COUNT never
// appear at all -- a 1-tag cell scoring 100% "weakness" would be a false-
// confidence ranking, the same evidence-honesty concern the design doc
// raises for this exact gate.
export function rankedCells(entries, minCount = MIN_TAG_COUNT) {
  return cellCounts(entries)
    .filter(c => c.total >= minCount)
    .sort((a, b) => b.score - a.score);
}

// null when nothing clears the gate -- the composition root renders a
// "not enough data yet" state in that case.
export function topWeakness(entries, minCount = MIN_TAG_COUNT) {
  const ranked = rankedCells(entries, minCount);
  return ranked.length ? ranked[0] : null;
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// e.g. "Left Hand" -- matches client/move-tagging.js's own LIMB_SIDE_OPTIONS
// label convention exactly (#584), so a limbSide anchor reads the same way
// the entry form's own Limb dropdown already does.
function limbSideLabel(limb, side) {
  return `${capitalize(side)} ${capitalize(limb)}`;
}

// The flattened, single-value anchor list a drill-down can pick from --
// deliberately scoped to values that actually appear in this user's own
// tagged data (cellCounts' own output), not the full theoretical
// vocabulary -- no point offering "Right Knee" as pickable if the user
// never tagged anything with it.
export function availableAnchors(entries) {
  const cells = cellCounts(entries);
  const anchors = [];
  const seen = new Set();
  function add(dimension, value, label) {
    const key = `${dimension}:${value}`;
    if (seen.has(key)) return;
    seen.add(key);
    anchors.push({ dimension, value, label });
  }
  for (const cell of cells) {
    add("limbSide", `${cell.limb}-${cell.side}`, limbSideLabel(cell.limb, cell.side));
    add("holdType", cell.holdType, cell.holdType);
    add("movementStyle", cell.movementStyle, cell.movementStyle);
    add("wallAngle", cell.wallAngle, cell.wallAngle);
  }
  return anchors;
}

function matchesAnchor(cell, dimension, value) {
  if (dimension === "limbSide") return `${cell.limb}-${cell.side}` === value;
  if (dimension === "holdType") return cell.holdType === value;
  if (dimension === "movementStyle") return cell.movementStyle === value;
  if (dimension === "wallAngle") return cell.wallAngle === value;
  return false;
}

// Ranks every combination of the *other three* dimensions for one fixed
// anchor value -- e.g. dimension="holdType", value="crimp" ranks every
// limb+side x movementStyle x wallAngle combination that involves crimp,
// weakest first, still subject to the same confidence gate.
export function rankedForAnchor(entries, dimension, value, minCount = MIN_TAG_COUNT) {
  return cellCounts(entries)
    .filter(c => matchesAnchor(c, dimension, value))
    .filter(c => c.total >= minCount)
    .sort((a, b) => b.score - a.score);
}

// Only "pinch" in the current hold-type vocabulary needs the "es" branch
// -- identical rule and identical reasoning to shared/injury-stats.js's
// own pluralizeHoldType, reimplemented here rather than imported since
// these two modules are otherwise independent.
function pluralizeHoldType(holdType) {
  return holdType.endsWith("ch") ? `${holdType}es` : `${holdType}s`;
}

// Plan-author's own reading of natural English for each of the four fixed
// wall-angle values (the design doc gives one worked example, not a
// general rule) -- see this plan's own Global Constraints for the ruling.
const WALL_ANGLE_ADJECTIVE = { slab: "slab", vert: "vertical", overhang: "overhanging", roof: "roof" };

// Structured data in, one prose sentence out -- same separation
// shared/injury-stats.js's describeCluster models for its own headline.
export function describeWeakness(cell) {
  return `Your ${cell.side} ${cell.limb} on ${WALL_ANGLE_ADJECTIVE[cell.wallAngle]} ${pluralizeHoldType(cell.holdType)} looks like a key weakness.`;
}
```

- [ ] **Step 4: Run the tests, confirm they pass**

Run: `pnpm exec vitest run test/shared/strengths-stats.test.js`
Expected: PASS (16 tests)

- [ ] **Step 5: Run the full suite to confirm no regressions**

Run: `pnpm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add shared/strengths-stats.js test/shared/strengths-stats.test.js
git commit -m "Add shared/strengths-stats.js: hardest-share ranking + confidence-gated drill-down"
```

---

## Task 2: `server/api/performance.js` — the strengths/weaknesses endpoint

**Files:**
- Modify: `server/api/performance.js`
- Modify: `server/index.js` (route registration)
- Test: `test/performance.test.js` (existing file, already has `describe("handleGetPyramid", ...)` and `describe("handleGetInjuryLog", ...)` blocks — add a new one alongside them, following the exact same real-HTTP-through-the-Worker pattern both already use)

**Interfaces:**
- Consumes: Task 1's `shared/strengths-stats.js` (`topWeakness`, `availableAnchors`, `rankedForAnchor`, `describeWeakness`), `server/api/logbook.js`'s already-exported `rowToJson`/`attachChildRows` (unchanged, already imported by this file for #39's own handler).
- Produces: `handleGetStrengthsWeaknesses(request, env, userId)` → with no query params, `{ headline: {cell, text} | null, anchors: Array<{dimension,value,label}> }`; with `?dimension=X&value=Y`, `{ ranked: Array<cell> }`. Registered at `/logbook/api/performance/strengths` in `server/index.js`'s `PUBLIC_GET_ROUTES`.

- [ ] **Step 1: Write the failing tests**

Append to `test/performance.test.js`, after the existing `describe("handleGetInjuryLog", ...)` block:

```js
const STRENGTHS_URL = "/logbook/api/performance/strengths";
function getStrengths(params = {}, extraCookie = cookie) {
  const qs = new URLSearchParams(params).toString();
  return fetchJson(`${STRENGTHS_URL}${qs ? `?${qs}` : ""}`, { headers: { Cookie: extraCookie } });
}

describe("handleGetStrengthsWeaknesses", () => {
  it("returns a null headline and empty anchors for a user with no tagged moves", async () => {
    await postEntry();
    const res = await getStrengths();
    const body = await res.json();
    expect(body.headline).toBeNull();
    expect(body.anchors).toEqual([]);
  });

  it("surfaces a headline once 5 matching hardest tags exist across entries", async () => {
    for (let i = 0; i < 5; i++) {
      await postEntry({ name: `Route ${i}`, moves: [{ difficulty: "hardest", limb: "hand", side: "left", holdType: "crimp", movementStyle: "static", wallAngle: "overhang" }] });
    }
    const res = await getStrengths();
    const { headline } = await res.json();
    expect(headline.text).toBe("Your left hand on overhanging crimps looks like a key weakness.");
    expect(headline.cell).toMatchObject({ limb: "hand", side: "left", holdType: "crimp", score: 1 });
  });

  it("lists available anchors once moves are tagged", async () => {
    await postEntry({ moves: [{ difficulty: "hardest", limb: "foot", side: "right", holdType: "toe-hook", movementStyle: "dynamic", wallAngle: "slab" }] });
    const { anchors } = await (await getStrengths()).json();
    expect(anchors).toContainEqual({ dimension: "holdType", value: "toe-hook", label: "toe-hook" });
    expect(anchors).toContainEqual({ dimension: "limbSide", value: "foot-right", label: "Right Foot" });
  });

  it("returns a ranked drill-down for a fixed anchor", async () => {
    for (let i = 0; i < 5; i++) {
      await postEntry({ name: `Route ${i}`, moves: [{ difficulty: "hardest", limb: "hand", side: "left", holdType: "crimp", movementStyle: "static", wallAngle: "overhang" }] });
    }
    const { ranked } = await (await getStrengths({ dimension: "holdType", value: "crimp" })).json();
    expect(ranked).toHaveLength(1);
    expect(ranked[0]).toMatchObject({ holdType: "crimp", score: 1, total: 5 });
  });

  it("excludes a soft-deleted entry's moves from both the headline and the anchor list", async () => {
    const created = await (await postEntry({ moves: [{ difficulty: "hardest", limb: "hand", side: "left", holdType: "crimp", movementStyle: "static", wallAngle: "overhang" }] })).json();
    await del(created.entries[0].id);
    const body = await (await getStrengths()).json();
    expect(body.headline).toBeNull();
    expect(body.anchors).toEqual([]);
  });

  it("returns an empty headline/anchors for an anonymous caller", async () => {
    const res = await fetchJson(STRENGTHS_URL);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ headline: null, anchors: [] });
  });

  it("a second user's own request never reflects the first user's tagged moves", async () => {
    await postEntry({ moves: [{ difficulty: "hardest", limb: "hand", side: "left", holdType: "crimp", movementStyle: "static", wallAngle: "overhang" }] });
    const userB = await createAuthedSession();
    const body = await (await getStrengths({}, userB.cookie)).json();
    expect(body).toEqual({ headline: null, anchors: [] });
  });
});
```

- [ ] **Step 2: Run the tests, confirm they fail**

Run: `pnpm exec vitest run test/performance.test.js -t "handleGetStrengthsWeaknesses"`
Expected: FAIL — `handleGetStrengthsWeaknesses` doesn't exist and isn't routed yet.

- [ ] **Step 3: Implement `handleGetStrengthsWeaknesses`**

In `server/api/performance.js`, add the import:

```js
import { availableAnchors, describeWeakness, rankedForAnchor, topWeakness } from "../../shared/strengths-stats.js";
```

Add the handler after `handleGetInjuryLog`:

```js
// #13 -- same online-only, server-computed convention as handleGetPyramid/
// handleGetInjuryLog above. One endpoint, two response shapes via query
// params, same branching-by-query-param pattern server/api/logbook.js's
// own handleGet already uses for its own multiple response shapes: no
// params returns the auto-surfaced default view (headline + the anchors
// a drill-down can pick from), ?dimension=X&value=Y returns that anchor's
// own ranked drill-down list.
export async function handleGetStrengthsWeaknesses(request, env, userId) {
  const rows = await listForUser(env, "entries", userId, rowToJson, { excludeDeleted: true });
  const entries = await attachChildRows(rows, env);

  const url = new URL(request.url);
  const dimension = url.searchParams.get("dimension");
  const value = url.searchParams.get("value");

  if (dimension && value) {
    return json({ ranked: rankedForAnchor(entries, dimension, value) }, 200, { "Cache-Control": "no-store" });
  }

  const weakest = topWeakness(entries);
  return json({
    headline: weakest ? { cell: weakest, text: describeWeakness(weakest) } : null,
    anchors: availableAnchors(entries),
  }, 200, { "Cache-Control": "no-store" });
}
```

Update `server/index.js`'s imports (currently `import { handleGetInjuryLog, handleGetPyramid } from "./api/performance.js";`):

```js
import { handleGetInjuryLog, handleGetPyramid, handleGetStrengthsWeaknesses } from "./api/performance.js";
```

Add the route to `PUBLIC_GET_ROUTES`, directly after the existing injury entry:

```js
  "/logbook/api/performance/injury": handleGetInjuryLog,
  // #13 -- same public-GET + server-side-computed convention as the two
  // routes above.
  "/logbook/api/performance/strengths": handleGetStrengthsWeaknesses,
```

- [ ] **Step 4: Run the tests, confirm they pass**

Run: `pnpm exec vitest run test/performance.test.js -t "handleGetStrengthsWeaknesses"`
Expected: PASS (7 tests)

- [ ] **Step 5: Run the full unit suite to confirm no regressions**

Run: `pnpm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add server/api/performance.js server/index.js test/performance.test.js
git commit -m "Add the /performance/strengths endpoint (#13)"
```

---

## Task 3: Route plumbing — hub tile, shell, composition-root boilerplate

**Files:**
- Create: `public/performance/strengths/index.html`
- Create: `client/performance-strengths-main.js`
- Modify: `client/performance-hub-main.js` (add to `INSIGHTS`)
- Modify: `server/api/owned-routes.js` (add to `SHELL_PATHS`)
- Modify: `server/index.js` (extend the owned-route regex, both occurrences)
- Modify: `package.json` (new `performance-strengths:build`/`:watch` scripts, `pages:build`, `dev:raw`/`dev:vite`, `e2e:build-fixtures`)
- Modify: `scripts/dev.mjs` (add to the `-n`/`-c`/command lists)
- Modify: `.gitignore` (new bundle-output entry + comment enumeration)
- Modify: `client/store.js` (add `"performance-strengths"` to the documented `activeView` union)
- Test: `test/owned-routes.test.js` (new shell-serving test, following the existing `/performance/injury` test's exact two-assertion pattern)

**Interfaces:**
- Consumes: Task 2's `/logbook/api/performance/strengths` endpoint.
- Produces: a real, navigable `/:username/performance/strengths` route. Task 4 fills in this composition root's actual rendering logic (currently a placeholder shell in this task).

- [ ] **Step 1: Add the hub tile**

In `client/performance-hub-main.js`, add to the `INSIGHTS` array (after the existing injury entry):

```js
  {
    id: "insight-strengths",
    title: "Strengths / Weaknesses",
    description: "See which hold types, wall angles, and movements are your weakest combination, and drill into any one of them.",
    route: "strengths",
  },
```

- [ ] **Step 2: Register the shell path and extend the owned-route regex**

In `server/api/owned-routes.js`, add to `SHELL_PATHS` (directly after the existing `"performance/injury"` entry):

```js
  "performance/injury": "/performance/injury/index.html",
  "performance/strengths": "/performance/strengths/index.html",
```

In `server/index.js`, change **both** occurrences of the owned-route regex (currently `performance(?:\/(?:pyramid|injury))?`) to:

```js
performance(?:\/(?:pyramid|injury|strengths))?
```

Full regex context (both occurrences, identical):

```js
const ownedRouteMatch = pathname.match(/^\/([^/]+)\/(log|map|performance(?:\/(?:pyramid|injury|strengths))?|sync|account(?:\/edit|\/import)?)\/?$/);
```

- [ ] **Step 3: Create the static shell**

Create `public/performance/strengths/index.html` — copy `public/performance/injury/index.html` verbatim, then make exactly these changes: `<title>` becomes `Strengths / Weaknesses – Climbing Logbook`, the header comment's own file-path/route references (username "read by client/performance-injury-main.js" etc.) get updated to say `client/performance-strengths-main.js`/this page's own route, the `#performance-offline` message's second `<p>` becomes "Reconnect and reload this page to see your strengths and weaknesses.", replace `<div id="injury-log-root"></div>` with `<div id="strengths-root"></div>`, and change the closing `<script>` tag's `src` to `/logbook/performance-strengths-app.js`.

- [ ] **Step 4: Create the composition-root skeleton**

Create `client/performance-strengths-main.js` — copy `client/performance-injury-main.js` verbatim as a starting point, then make these changes: rename `INJURY_URL` to `STRENGTHS_URL = "/logbook/api/performance/strengths"`, rename `fetchInjuryLog` to `fetchStrengths`, remove the `injuryRootEl`/`document.getElementById("injury-log-root")` line and replace it with `const strengthsRootEl = document.getElementById("strengths-root");`, change `store.setActiveView("performance-injury")` to `store.setActiveView("performance-strengths")`, update the file's own header comment to reference `#13` instead of `#39` and describe strengths/weaknesses instead of the injury log, and in `boot()`'s try/catch, replace the call to `renderInjuryLog(data)` with a call to a new (currently empty) `renderStrengths(data)` function — Task 4 fills this in; for this task, stub it as:

```js
function renderStrengths(data) {
  // Task 4 fills this in.
  strengthsRootEl.textContent = JSON.stringify(data);
}
```

and the `boot()` try/catch body becomes:

```js
  try {
    const data = await fetchStrengths();
    offlineEl.hidden = true;
    strengthsRootEl.hidden = false;
    renderStrengths(data);
  } catch {
    offlineEl.hidden = false;
    strengthsRootEl.hidden = true;
  }
```

- [ ] **Step 5: Add build scripts**

In `package.json`'s `scripts`, add directly after the existing `performance-injury:build`/`:watch` pair:

```json
    "performance-strengths:build": "esbuild client/performance-strengths-main.js --bundle --format=esm --outfile=public/logbook/performance-strengths-app.js --minify --external:./escape-html.js --external:./floating-ui-dom.js",
    "performance-strengths:watch": "esbuild client/performance-strengths-main.js --bundle --format=esm --outfile=public/logbook/performance-strengths-app.js --watch --external:./escape-html.js --external:./floating-ui-dom.js",
```

Add `pnpm run performance-strengths:build` to the `pages:build` chain, directly after `pnpm run performance-injury:build`.

Change `dev:raw` (inserting `performance-strengths` after `performance-injury` in both the `-n` and `-c` lists — the `-c` list's repeating 6-color cycle, `blue,magenta,yellow,cyan,white,gray`, shifts by one position for everything after the insertion point):

```json
"dev:raw": "concurrently -n wrangler,tailwind,map,performance-pyramid,performance-hub,performance-injury,performance-strengths,log,profile,account,account-edit,account-import,sync,beta-gate -c blue,magenta,yellow,cyan,white,gray,blue,magenta,yellow,cyan,white,gray,blue,magenta \"wrangler dev\" \"tailwindcss -i ./styles/tailwind.css -o ./public/logbook/tailwind.css --watch\" \"pnpm run map:watch\" \"pnpm run performance-pyramid:watch\" \"pnpm run performance-hub:watch\" \"pnpm run performance-injury:watch\" \"pnpm run performance-strengths:watch\" \"pnpm run log:watch\" \"pnpm run profile:watch\" \"pnpm run account:watch\" \"pnpm run account-edit:watch\" \"pnpm run account-import:watch\" \"pnpm run sync:watch\" \"pnpm run beta-gate:watch\"",
```

Change `dev:vite` the same way (only the `-n` list's first entry and the first quoted command differ, `vite`/`"vite dev"` instead of `wrangler`/`"wrangler dev"`):

```json
"dev:vite": "concurrently -n vite,tailwind,map,performance-pyramid,performance-hub,performance-injury,performance-strengths,log,profile,account,account-edit,account-import,sync,beta-gate -c blue,magenta,yellow,cyan,white,gray,blue,magenta,yellow,cyan,white,gray,blue,magenta \"vite dev\" \"tailwindcss -i ./styles/tailwind.css -o ./public/logbook/tailwind.css --watch\" \"pnpm run map:watch\" \"pnpm run performance-pyramid:watch\" \"pnpm run performance-hub:watch\" \"pnpm run performance-injury:watch\" \"pnpm run performance-strengths:watch\" \"pnpm run log:watch\" \"pnpm run profile:watch\" \"pnpm run account:watch\" \"pnpm run account-edit:watch\" \"pnpm run account-import:watch\" \"pnpm run sync:watch\" \"pnpm run beta-gate:watch\"",
```

In `scripts/dev.mjs`, change the `-n`/`-c` lists and the spawn args array (this file has no `beta-gate` entry — a pre-existing, already-accepted drift, not something this task fixes):

```js
  "-n", "vite,tailwind,map,performance-pyramid,performance-hub,performance-injury,performance-strengths,log,profile,account,account-edit,account-import,sync",
  "-c", "blue,magenta,yellow,cyan,white,gray,blue,magenta,yellow,cyan,white,gray,blue",
  "vite dev",
  "tailwindcss -i ./styles/tailwind.css -o ./public/logbook/tailwind.css --watch",
  "pnpm run map:watch",
  "pnpm run performance-pyramid:watch",
  "pnpm run performance-hub:watch",
  "pnpm run performance-injury:watch",
  "pnpm run performance-strengths:watch",
  "pnpm run log:watch",
  "pnpm run profile:watch",
  "pnpm run account:watch",
  "pnpm run account-edit:watch",
  "pnpm run account-import:watch",
  "pnpm run sync:watch",
```

- [ ] **Step 6: Update `.gitignore`, `e2e:build-fixtures`, and `store.js`**

In `.gitignore`, add `client/performance-strengths-main.js` to the explanatory comment's enumeration list (alongside the other composition roots it already names), and add directly after the existing `public/logbook/performance-injury-app.js` line:

```
public/logbook/performance-strengths-app.js
```

In `package.json`'s `e2e:build-fixtures` script, add a new `cp` clause copying `public/performance/strengths/index.html` to `public/e2e-fixtures/pages/performance-strengths.html`, following the exact pattern the `performance.html`/`performance-pyramid.html`/`performance-injury.html` clauses already use. Do **not** add a separate esbuild clause bundling `client/performance-strengths-main.js` into `public/e2e-fixtures/` — #39's own final review found and removed exactly this kind of dead build step (nothing loads a fixtures-specific bundle; the fixture page's own `<script src="/logbook/performance-strengths-app.js">` tag is served from the real build output, matching every other fixture page).

In `client/store.js`, find the comment documenting the `activeView` union (currently ending `"performance-hub" | "performance-injury"`) and add `"performance-strengths"` to it.

- [ ] **Step 7: Write the failing shell-serving test**

In `test/owned-routes.test.js`, add directly after the existing `"serves the real static shell for performance/injury"` test:

```js
  it("serves the real static shell for performance/strengths", async () => {
    const { cookie } = await createAuthedSession({ username: "strengthsshelluser", hostname: "climbinglogbook.com" });
    const res = await fetchOwnedRoute("strengthsshelluser", "performance/strengths", { cookie });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('id="strengths-root"');
    expect(html).toContain('src="/logbook/performance-strengths-app.js"');
  });
```

- [ ] **Step 8: Run the test, confirm it passes** (after Steps 1-6's file changes are in place)

Run: `pnpm exec vitest run test/owned-routes.test.js -t "performance/strengths"`
Expected: PASS

- [ ] **Step 9: Run the full unit suite**

Run: `pnpm test`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add client/performance-hub-main.js client/performance-strengths-main.js client/store.js public/performance/strengths/index.html server/api/owned-routes.js server/index.js package.json scripts/dev.mjs .gitignore test/owned-routes.test.js
git commit -m "Wire up the /performance/strengths route (#13): hub tile, shell, composition root skeleton"
```

---

## Task 4: The actual UI — headline, drill-down picker, ranked list

**Files:**
- Modify: `client/performance-strengths-main.js` (replace Task 3's `renderStrengths` stub)
- Test: manual verification (pure DOM-rendering + one interactive control; e2e coverage is Task 5)

**Interfaces:**
- Consumes: Task 2's endpoint response shapes (`{headline, anchors}` on initial load, `{ranked}` on drill-down), Task 1's `describeWeakness` is NOT needed client-side (the server's `headline.text` already carries the finished sentence) — only the per-row description needs building client-side, since the server's `ranked` response is raw cell data with no prose attached.

- [ ] **Step 1: Implement the real `renderStrengths` plus the drill-down interaction**

In `client/performance-strengths-main.js`, add the import:

```js
import { escapeHtml } from "./escape-html.js";
```

Replace Task 3's stub `renderStrengths` with:

```js
function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function cellRowHtml(cell) {
  const pct = Math.round(cell.score * 100);
  const label = `${capitalize(cell.side)} ${capitalize(cell.limb)} · ${capitalize(cell.holdType)} · ${capitalize(cell.movementStyle)} · ${capitalize(cell.wallAngle)}`;
  return `<div class="row-card">
    <span class="row-card-title">${escapeHtml(label)}</span>
    <p class="text-[.82rem] text-muted mt-1">${pct}% hardest (${cell.hardestCount}/${cell.total})</p>
  </div>`;
}

async function fetchRankedForAnchor(dimension, value) {
  const res = await fetch(`${STRENGTHS_URL}?dimension=${encodeURIComponent(dimension)}&value=${encodeURIComponent(value)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function onAnchorChange(select) {
  const rankedListEl = document.getElementById("strengths-ranked-list");
  const [dimension, value] = select.value.split(":");
  if (!dimension) {
    rankedListEl.innerHTML = "";
    return;
  }
  try {
    const { ranked } = await fetchRankedForAnchor(dimension, value);
    rankedListEl.innerHTML = ranked.length
      ? ranked.map(cellRowHtml).join("")
      : `<p class="text-[.85rem] text-muted">No combinations for this anchor clear the confidence gate yet.</p>`;
  } catch {
    rankedListEl.innerHTML = `<p class="text-[.85rem] text-muted">Couldn't load this drill-down -- try again.</p>`;
  }
}

function anchorOptionsHtml(anchors) {
  const groups = {
    limbSide: { label: "Limb", options: [] },
    holdType: { label: "Hold type", options: [] },
    movementStyle: { label: "Movement", options: [] },
    wallAngle: { label: "Wall angle", options: [] },
  };
  for (const anchor of anchors) {
    groups[anchor.dimension].options.push(anchor);
  }
  return Object.values(groups)
    .filter(g => g.options.length)
    .map(g => `<optgroup label="${escapeHtml(g.label)}">${g.options.map(a => `<option value="${escapeHtml(a.dimension)}:${escapeHtml(a.value)}">${escapeHtml(a.label)}</option>`).join("")}</optgroup>`)
    .join("");
}

function renderStrengths({ headline, anchors }) {
  const headlineHtml = headline
    ? `<p class="text-[.95rem] font-semibold text-foreground mb-4" id="strengths-headline">${escapeHtml(headline.text)}</p>`
    : `<p class="text-[.85rem] text-muted mb-4" id="strengths-headline">Not enough data yet to spot a pattern -- keep tagging moves as you climb.</p>`;

  const pickerHtml = anchors.length
    ? `<div class="mb-4">
        <label class="text-[.72rem] font-semibold uppercase tracking-[.07em] text-muted mb-2 block" for="strengths-anchor-select">Drill into</label>
        <select class="w-full bg-surface border border-border rounded-app px-2 py-2 text-[.9rem]" id="strengths-anchor-select">
          <option value="">Choose one…</option>
          ${anchorOptionsHtml(anchors)}
        </select>
      </div>
      <div id="strengths-ranked-list"></div>`
    : "";

  strengthsRootEl.innerHTML = headlineHtml + pickerHtml;

  const select = document.getElementById("strengths-anchor-select");
  if (select) select.addEventListener("change", () => onAnchorChange(select));
}
```

- [ ] **Step 2: Manual verification**

Run: `pnpm dev`, log in via `http://my.localhost:<port>/login/`, tag at least 5 hardest moves with the same combination via the entry form's Move difficulty section, navigate to `/performance/strengths`. Expected: headline reads the exact sentence for that combination; the "Drill into" dropdown lists every dimension value actually tagged, grouped by dimension; picking one re-renders the ranked list below it, scoped to that anchor.

- [ ] **Step 3: Run the full unit suite to confirm no regressions**

Run: `pnpm test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add client/performance-strengths-main.js
git commit -m "Render the strengths/weaknesses headline and drill-down UI (#13)"
```

---

## Task 5: End-to-end coverage

**Files:**
- Create: `e2e/performance-strengths-page.spec.js` (new file, following `e2e/performance-injury-page.spec.js`'s exact established pattern)
- Modify: `e2e/mock-api.js` (a new `strengthsData` option, mirroring the existing `injuryData` option's exact pattern from #39)
- Test: itself

**Interfaces:**
- Consumes: the full Task 1-4 stack, end-to-end, through the real UI and a mocked `/logbook/api/*`.

- [ ] **Step 1: Read `e2e/performance-injury-page.spec.js` and `e2e/mock-api.js` in full to confirm the exact pattern to extend**

Confirm `mockApi()`'s current shape (it already has `pyramidData` and `injuryData` options as of #39, added via a destructured parameter default plus a `page.route(...)` call inside the function body — find both for `injuryData` as the exact template to follow). Add two new destructured parameters, alongside the existing `injuryData` one:

```js
  strengthsData = { headline: null, anchors: [] },
  strengthsRankedData = { ranked: [] },
```

This endpoint needs a single route handler that branches on the intercepted request's own query params (unlike `pyramidData`/`injuryData`, which each always return one fixed shape) — add this `page.route(...)` call directly after the existing `injuryData` one:

```js
  await page.route("**/logbook/api/performance/strengths**", route => {
    const url = new URL(route.request().url());
    const isDrilldown = url.searchParams.has("dimension") && url.searchParams.has("value");
    return route.fulfill({ json: isDrilldown ? strengthsRankedData : strengthsData });
  });
```

(Note the `**` at the end of the URL pattern, not present on `pyramidData`/`injuryData`'s own patterns — Playwright's glob route matching needs it here specifically because this route's real requests carry a query string, `?dimension=...&value=...`, which the other two routes' requests never do.)

- [ ] **Step 2: Write the failing e2e tests**

Create `e2e/performance-strengths-page.spec.js` (adapt exact mocking syntax to match Step 1's findings):

```js
// #13 (epic #5 Phase 2) -- composition-root-wiring coverage for
// /:username/performance/strengths, same fixture-harness pattern as
// e2e/performance-injury-page.spec.js. athleteMode: true is required in
// the mocked settings response -- client/performance-strengths-main.js
// redirects to /log otherwise (#151's rule).
import { expect, test } from "@playwright/test";
import { mockApi } from "./mock-api.js";

test("shows the not-enough-data message with no tagged moves", async ({ page }) => {
  await mockApi(page, {
    settings: { athleteMode: true, activeDiscipline: "boulder" },
    strengthsData: { headline: null, anchors: [] },
  });
  await page.goto("/e2e-fixtures/pages/performance-strengths.html");

  await expect(page.locator("climbing-header h1")).toHaveText("Climbing Logbook");
  await expect(page.locator("climbing-tab-bar a", { hasText: "Performance Insights" })).toHaveAttribute("aria-current", "page");
  await expect(page.locator("#strengths-headline")).toContainText("Not enough data yet");
  await expect(page.locator("#strengths-anchor-select")).toHaveCount(0);
});

test("renders the headline and drill-down picker, and re-ranks on anchor change", async ({ page }) => {
  await mockApi(page, {
    settings: { athleteMode: true, activeDiscipline: "boulder" },
    strengthsData: {
      headline: { cell: { limb: "hand", side: "left", holdType: "crimp", movementStyle: "static", wallAngle: "overhang", score: 1 }, text: "Your left hand on overhanging crimps looks like a key weakness." },
      anchors: [{ dimension: "holdType", value: "crimp", label: "crimp" }],
    },
    strengthsRankedData: {
      ranked: [{ limb: "hand", side: "left", holdType: "crimp", movementStyle: "static", wallAngle: "overhang", hardestCount: 5, easiestCount: 0, total: 5, score: 1 }],
    },
  });
  await page.goto("/e2e-fixtures/pages/performance-strengths.html");

  await expect(page.locator("#strengths-headline")).toHaveText("Your left hand on overhanging crimps looks like a key weakness.");
  await page.locator("#strengths-anchor-select").selectOption("holdType:crimp");
  await expect(page.locator("#strengths-ranked-list .row-card-title")).toContainText("Left Hand");
  await expect(page.locator("#strengths-ranked-list")).toContainText("100% hardest (5/5)");
});

test("shows the offline message instead of the view when the fetch fails", async ({ page }) => {
  await mockApi(page, { settings: { athleteMode: true, activeDiscipline: "boulder" } });
  await page.route("**/logbook/api/performance/strengths", route => route.fulfill({ status: 500 }));
  await page.goto("/e2e-fixtures/pages/performance-strengths.html");

  await expect(page.locator("#performance-offline")).toBeVisible();
  await expect(page.locator("#strengths-root")).toBeHidden();
});

test("redirects to /log when Athlete Mode is off", async ({ page }) => {
  await mockApi(page, { settings: { athleteMode: false, activeDiscipline: "boulder" } });
  await page.goto("/e2e-fixtures/pages/performance-strengths.html");

  await page.waitForURL(/\/log$/);
});
```

- [ ] **Step 3: Run the tests, confirm they fail**

Run: `pnpm run e2e:build-fixtures && pnpm exec playwright test e2e/performance-strengths-page.spec.js`
Expected: FAIL until Step 1's `mockApi()` extension is correctly wired — fix any mismatch before treating this as a real product-code failure.

- [ ] **Step 4: Fix any real issues, re-run until green**

Run: `pnpm exec playwright test e2e/performance-strengths-page.spec.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Run the full e2e suite twice**

Run: `pnpm exec playwright test` (twice)
Expected: PASS both times, modulo the already-known, unrelated intermittent `e2e/register.spec.js` flake (real server-side Turnstile network dependency, tracked separately, not something to investigate here).

- [ ] **Step 6: Run the full unit suite one final time**

Run: `pnpm test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add e2e/mock-api.js e2e/performance-strengths-page.spec.js
git commit -m "Add e2e coverage for the strengths/weaknesses view (#13)"
```

---

## Final Verification

- [ ] `pnpm test` — full pass
- [ ] `pnpm exec playwright test` — full pass, twice (modulo the known unrelated register.spec.js flake)
- [ ] Manual: `pnpm dev`, log in via `http://my.localhost:<port>/login/`, tag 5+ moves with one combination, confirm the headline and drill-down both render and re-rank correctly on selection.
- [ ] Confirm the hub page (`/performance`) now shows three tiles (Grade Pyramid, Injury/Pain Log, Strengths/Weaknesses), and the new tile's "View" link navigates to `/performance/strengths`.
- [ ] Confirm `server/api/public-data.js` has no route to `/logbook/api/performance/strengths` (same check #39's final review already ran for its own new endpoint).
- [ ] Confirm `git log --oneline` shows 5 task commits, each independently reviewable.
