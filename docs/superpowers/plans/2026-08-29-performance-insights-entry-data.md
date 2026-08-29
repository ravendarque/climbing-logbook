# Performance Insights: Entry Data Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture the four Phase-1-schema fields (`attemptsToSend`, `rpe`, `entry_moves`, `entry_pain_moves`) end-to-end — API read/write plumbing plus a new "Performance data" section on the add/edit entry modal — so the five remaining Performance Insights views (#15/#13/#14/#38/#39) have real data to render once each is built.

**Architecture:** Extend `shared/entry-schema.js` with the four new fields (flat `attemptsToSend`/`rpe`, nested arrays `moves`/`painMoves`). Extend `server/lib/d1-resource.js` with two opt-in hooks (`afterWrite`, `decorateRows`) so `entries`' shared `handlePost` can diff-and-replace child rows and attach them on read, without duplicating that factory's dedup/resurrect/idempotent-replay logic. Extend `server/api/logbook.js`'s own hand-rolled `handleGet`/`handlePut`/`handleDelete` the same way. Add a new "Performance data" section to `client/entry-form.js`/`public/log/index.html`: a conditionally-visible Exertion slider, an always-visible Attempts stepper, and two instances of a new shared cascading-dropdown row-list widget (Move difficulty's Hardest/Easiest lists, Pain/injury's one list) built once and reused, matching the design doc's explicit DRY requirement.

**Tech Stack:** Cloudflare Workers + D1, Valibot (`shared/entry-schema.js`), Vitest (`@cloudflare/vitest-pool-workers`), Playwright, esbuild, Tailwind v4 `@utility` classes.

**Spec:** `docs/superpowers/specs/2026-08-27-performance-insights-ui-design.md` — "Data model", "Entry form" sections. Also `docs/climbing-analytics-research.md` §6 for the analytical framing these fields eventually feed. This plan implements only the **Entry form** section plus its required API plumbing — not any of the five view pages themselves (those are separate, later plans/PRs).

## Global Constraints

- **Deploy classification: beta-only, no migrations touched.** All four DB objects this plan writes to (`entries.attempts_to_send`, `entries.rpe`, `entry_moves`, `entry_pain_moves`) already exist — added by Phase 1 (#580, migrations `0007_add_entry_moves.sql`, `0008_add_attempts_to_send.sql`, `0009_add_rpe.sql`, `0010_add_entry_pain_moves.sql`), already merged to `main`. This PR needs a deliberate `promote.yml` run after merge, same as #575.
- **`shared/entry-schema.js` is the single source of truth for entry shape**, imported by both `client/entry-form.js` and `server/api/logbook.js`. Every new field's validation lives there once, not duplicated client/server.
- **Wire format is camelCase** (`attemptsToSend`, `rpe`, `moves`, `painMoves`); DB columns are snake_case (`attempts_to_send`, `rpe`, `entry_moves`/`entry_pain_moves` rows' own columns). `buildRow`/`rowToJson` in `server/api/logbook.js` are the translation boundary, exactly as every existing field already works.
- **Hold-type vocabulary** (the design doc left this "an implementation-time detail" — fixed here, used consistently client+server): hand → `crimp`, `jug`, `pocket`, `sloper`, `pinch`, `edge`. foot → `toe-hook`, `heel-hook`. knee → `kneebar`.
- **Movement-style vocabulary** (fixed by the already-merged migrations' own CHECK constraints — not a plan decision): hand → `static`, `dynamic`, `lockoff`. foot/knee → `static`, `dynamic`.
- **Wall-angle vocabulary** (fixed by migration CHECK): `slab`, `vert`, `overhang`, `roof`.
- **Limb vocabulary** (fixed by migration CHECK): `hand`, `foot`, `knee`, each × side `left`/`right`.
- **Ruling — the entry form's "Limb" dropdown combines limb+side into six options** (`Left Hand`, `Right Hand`, `Left Foot`, `Right Foot`, `Left Knee`, `Right Knee`), not two separate dropdowns. The design doc's "Entry form" section describes a 4-visible-field grid (Limb, Hold type, Movement, Wall angle) but the schema requires 5 values per row (limb, side, hold_type, movement_style, wall_angle) since "side is always meaningful" per the doc's own Data Model section. Combining limb+side into one dropdown is the only reading that reconciles a 4-field grid with 5 required values without inventing a 5th field the design never mentioned. The underlying `limb` (for cascading hold-type/movement-style filtering) is derived by stripping the side prefix.
- **`--color-tier-community` already exists** in `styles/tailwind.css` (added alongside `--color-tier-peer`/`--color-tier-heuristic` — confirmed by direct read, not something this plan needs to add). Not used by this plan (no evidence-tier chip on the entry form), noted only because a stale earlier assumption in this epic's own research had it as still-needed; recorded here so a future view's plan doesn't re-derive this.
- **Diff-and-replace, not merge**, for `entry_moves`/`entry_pain_moves` on every entry write (add or edit) — per the design doc's own "Offline" section: "the server's upsert diffs-and-replaces those child rows by `entry_id`." Implemented as `DELETE ... WHERE entry_id = ?` followed by fresh `INSERT`s, wrapped in one `env.LOGBOOK_DB.batch([...])` call for atomicity (not sequential awaits — a partial failure between a delete and its inserts would otherwise leave an entry's move-tags empty).
- **A soft-deleted entry's child rows are left in place, not deleted.** The migrations' own comment already documents this: `ON DELETE CASCADE` is a backstop for a hard-delete path that doesn't exist in normal operation (entries are soft-deleted via `deleted_at`), and future aggregation queries (#13/#38/#39) are expected to filter `entries.deleted_at IS NULL` themselves. `handleDelete` in this plan does not touch `entry_moves`/`entry_pain_moves` at all.
- **Existing `test/logbook.test.js` assertions were checked against this plan's read-path change** (adding `attemptsToSend`/`rpe`/`moves`/`painMoves` to every entry object every read path returns): none of its `toEqual(...)` assertions hardcode a literal full-entry-shape object — they compare `.name`/`.id` projections, empty-array/empty-list shapes, or two live API responses against each other (e.g. `expect(entries).toEqual([created.entries[0]])`). Adding fields to every entry response is confirmed safe against the existing suite; no pre-existing test needs updating for this reason alone.
- **Test commands**: `pnpm test` (Vitest, real D1 via `vitest-pool-workers`), `pnpm exec playwright test` (Playwright, run twice for idempotency per this repo's standard).

---

## Task 1: `shared/entry-schema.js` — validate the four new fields

**Files:**
- Modify: `shared/entry-schema.js`
- Test: `test/entry-schema.test.js` (new file — this module currently has no dedicated unit test file; existing coverage is indirect via `test/logbook.test.js`'s HTTP-level tests. A pure-logic module doing this much new cross-field validation needs direct unit coverage.)

**Interfaces:**
- Consumes: nothing new from other tasks (this is the first task).
- Produces: `validateEntryShape(entry)` (existing signature, unchanged — still returns `null` or a single message string) now also validates `entry.attemptsToSend`, `entry.rpe`, `entry.moves`, `entry.painMoves`. New exports: `VALID_LIMBS`, `VALID_SIDES`, `VALID_WALL_ANGLES`, `HOLD_TYPES_BY_LIMB` (object, keyed by limb), `MOVEMENT_STYLES_BY_LIMB` (object, keyed by limb) — Task 5 (client UI) imports these directly to populate the cascading dropdowns, so the vocabulary lives in exactly one place.

- [ ] **Step 1: Add the new vocabulary constants and write their test**

Add to `shared/entry-schema.js`, right after the existing `VALID_GRADES` export (after line 34):

```js
// #575 Phase 2 entry-data plan -- vocabulary for entry_moves/entry_pain_moves
// rows (#36/#572). Fixed here as the single source of truth for both the
// server-side validator below and client/entry-form.js's cascading
// dropdowns (Task 5 of the same plan) -- hold_type/movement_style options
// depend on which limb is selected, so this is keyed by limb rather than
// three flat lists.
export const VALID_LIMBS = ["hand", "foot", "knee"];
export const VALID_SIDES = ["left", "right"];
export const VALID_WALL_ANGLES = ["slab", "vert", "overhang", "roof"];

export const HOLD_TYPES_BY_LIMB = {
  hand: ["crimp", "jug", "pocket", "sloper", "pinch", "edge"],
  foot: ["toe-hook", "heel-hook"],
  knee: ["kneebar"],
};

// migrations/0007_add_entry_moves.sql's own CHECK constraint is the source
// of truth for this rule (lockoff is hand-only) -- mirrored here so the
// same rule is enforced client-side (Task 5) and at this validation layer,
// not just as a DB-level backstop.
export const MOVEMENT_STYLES_BY_LIMB = {
  hand: ["static", "dynamic", "lockoff"],
  foot: ["static", "dynamic"],
  knee: ["static", "dynamic"],
};
```

Create `test/entry-schema.test.js`:

```js
import { describe, expect, it } from "vitest";
import {
  HOLD_TYPES_BY_LIMB,
  MOVEMENT_STYLES_BY_LIMB,
  VALID_LIMBS,
  VALID_SIDES,
  VALID_WALL_ANGLES,
  validateEntryShape,
} from "../shared/entry-schema.js";

function validEntry(overrides = {}) {
  return {
    placeId: "place-1",
    name: "La Marie-Rose",
    grade: "6B",
    type: "boulder",
    status: "send",
    ...overrides,
  };
}

describe("vocabulary constants", () => {
  it("exports the fixed limb/side/wall-angle lists", () => {
    expect(VALID_LIMBS).toEqual(["hand", "foot", "knee"]);
    expect(VALID_SIDES).toEqual(["left", "right"]);
    expect(VALID_WALL_ANGLES).toEqual(["slab", "vert", "overhang", "roof"]);
  });

  it("only offers lockoff for hand", () => {
    expect(MOVEMENT_STYLES_BY_LIMB.hand).toContain("lockoff");
    expect(MOVEMENT_STYLES_BY_LIMB.foot).not.toContain("lockoff");
    expect(MOVEMENT_STYLES_BY_LIMB.knee).not.toContain("lockoff");
  });

  it("has a hold-type list for every limb", () => {
    for (const limb of VALID_LIMBS) {
      expect(HOLD_TYPES_BY_LIMB[limb].length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run the new test file, confirm it passes (nothing to implement yet)**

Run: `pnpm exec vitest run test/entry-schema.test.js`
Expected: PASS (3 tests) — this step only exercises the constants just added, confirming the export shape before the harder validation logic below.

- [ ] **Step 3: Write the failing tests for `attemptsToSend`/`rpe` validation**

Append to `test/entry-schema.test.js`:

```js
describe("attemptsToSend", () => {
  it("accepts a valid entry with no attemptsToSend", () => {
    expect(validateEntryShape(validEntry())).toBeNull();
  });

  it("accepts a non-negative integer", () => {
    expect(validateEntryShape(validEntry({ attemptsToSend: 7 }))).toBeNull();
  });

  it("accepts explicit null", () => {
    expect(validateEntryShape(validEntry({ attemptsToSend: null }))).toBeNull();
  });

  it("rejects a negative number", () => {
    expect(validateEntryShape(validEntry({ attemptsToSend: -1 }))).toBe("attemptsToSend must be a non-negative integer");
  });

  it("rejects a non-integer", () => {
    expect(validateEntryShape(validEntry({ attemptsToSend: 2.5 }))).toBe("attemptsToSend must be a non-negative integer");
  });

  it("rejects a string", () => {
    expect(validateEntryShape(validEntry({ attemptsToSend: "7" }))).toBe("attemptsToSend must be a non-negative integer");
  });
});

describe("rpe", () => {
  it("accepts a valid multiple of 10 in range", () => {
    expect(validateEntryShape(validEntry({ rpe: 70 }))).toBeNull();
  });

  it("accepts 0 and 100", () => {
    expect(validateEntryShape(validEntry({ rpe: 0 }))).toBeNull();
    expect(validateEntryShape(validEntry({ rpe: 100 }))).toBeNull();
  });

  it("accepts explicit null", () => {
    expect(validateEntryShape(validEntry({ rpe: null }))).toBeNull();
  });

  it("rejects a value above 100", () => {
    expect(validateEntryShape(validEntry({ rpe: 110 }))).toBe("rpe must be a multiple of 10 between 0 and 100");
  });

  it("rejects a value below 0", () => {
    expect(validateEntryShape(validEntry({ rpe: -10 }))).toBe("rpe must be a multiple of 10 between 0 and 100");
  });

  it("rejects a non-multiple-of-10 value", () => {
    expect(validateEntryShape(validEntry({ rpe: 55 }))).toBe("rpe must be a multiple of 10 between 0 and 100");
  });
});
```

- [ ] **Step 4: Run the tests, confirm they fail**

Run: `pnpm exec vitest run test/entry-schema.test.js`
Expected: FAIL — the 12 new tests either pass validation they shouldn't (no check exists yet) or fail ones that should pass are unaffected; the rejects-* tests will fail because nothing currently rejects these values.

- [ ] **Step 5: Add `attemptsToSend`/`rpe` to the schema object and their checks to the rawCheck**

In `shared/entry-schema.js`, add both fields to the `v.object({...})` call (after `notes: anyField,` around line 75):

```js
    notes: anyField,
    attemptsToSend: anyField,
    rpe: anyField,
```

Add their checks inside the `v.rawCheck(...)` callback, after the existing `notes` check (the last statement in the callback, currently ending the function around line 148):

```js
    if (entry.notes && typeof entry.notes !== "string") {
      addIssue({ message: "notes must be a string", path: fieldPath(entry, "notes") });
    }
    if (entry.attemptsToSend !== undefined && entry.attemptsToSend !== null) {
      if (!Number.isInteger(entry.attemptsToSend) || entry.attemptsToSend < 0) {
        addIssue({ message: "attemptsToSend must be a non-negative integer", path: fieldPath(entry, "attemptsToSend") });
      }
    }
    if (entry.rpe !== undefined && entry.rpe !== null) {
      if (!Number.isInteger(entry.rpe) || entry.rpe < 0 || entry.rpe > 100 || entry.rpe % 10 !== 0) {
        addIssue({ message: "rpe must be a multiple of 10 between 0 and 100", path: fieldPath(entry, "rpe") });
      }
    }
```

- [ ] **Step 6: Run the tests, confirm they pass**

Run: `pnpm exec vitest run test/entry-schema.test.js`
Expected: PASS (all tests so far)

- [ ] **Step 7: Write the failing tests for `moves`/`painMoves` row validation**

Append to `test/entry-schema.test.js`:

```js
function validMoveRow(overrides = {}) {
  return { difficulty: "hardest", limb: "hand", side: "left", holdType: "crimp", movementStyle: "static", wallAngle: "overhang", ...overrides };
}
function validPainRow(overrides = {}) {
  return { limb: "foot", side: "right", holdType: "toe-hook", movementStyle: "dynamic", wallAngle: "slab", ...overrides };
}

describe("moves", () => {
  it("accepts an entry with no moves", () => {
    expect(validateEntryShape(validEntry())).toBeNull();
  });

  it("accepts an empty moves array", () => {
    expect(validateEntryShape(validEntry({ moves: [] }))).toBeNull();
  });

  it("accepts a valid hardest move", () => {
    expect(validateEntryShape(validEntry({ moves: [validMoveRow()] }))).toBeNull();
  });

  it("accepts a valid easiest move", () => {
    expect(validateEntryShape(validEntry({ moves: [validMoveRow({ difficulty: "easiest" })] }))).toBeNull();
  });

  it("accepts multiple valid moves", () => {
    expect(validateEntryShape(validEntry({
      moves: [validMoveRow(), validMoveRow({ difficulty: "easiest", limb: "foot", side: "right", holdType: "heel-hook", movementStyle: "dynamic" })],
    }))).toBeNull();
  });

  it("accepts a valid lockoff move (hand only)", () => {
    expect(validateEntryShape(validEntry({ moves: [validMoveRow({ movementStyle: "lockoff" })] }))).toBeNull();
  });

  it("rejects an invalid difficulty", () => {
    expect(validateEntryShape(validEntry({ moves: [validMoveRow({ difficulty: "medium" })] }))).toBe("moves[0].difficulty must be one of: hardest, easiest");
  });

  it("rejects an invalid limb", () => {
    expect(validateEntryShape(validEntry({ moves: [validMoveRow({ limb: "elbow" })] }))).toBe("moves[0].limb must be one of: hand, foot, knee");
  });

  it("rejects an invalid side", () => {
    expect(validateEntryShape(validEntry({ moves: [validMoveRow({ side: "middle" })] }))).toBe("moves[0].side must be one of: left, right");
  });

  it("rejects a hold type not valid for the given limb", () => {
    expect(validateEntryShape(validEntry({ moves: [validMoveRow({ limb: "foot", side: "right", holdType: "crimp" })] })))
      .toBe("moves[0].holdType must be one of: toe-hook, heel-hook");
  });

  it("rejects lockoff for a non-hand limb", () => {
    expect(validateEntryShape(validEntry({ moves: [validMoveRow({ limb: "foot", side: "right", holdType: "toe-hook", movementStyle: "lockoff" })] })))
      .toBe("moves[0].movementStyle must be one of: static, dynamic");
  });

  it("rejects an invalid wall angle", () => {
    expect(validateEntryShape(validEntry({ moves: [validMoveRow({ wallAngle: "ceiling" })] }))).toBe("moves[0].wallAngle must be one of: slab, vert, overhang, roof");
  });

  it("reports the correct index for the second row", () => {
    expect(validateEntryShape(validEntry({ moves: [validMoveRow(), validMoveRow({ wallAngle: "ceiling" })] }))).toBe("moves[1].wallAngle must be one of: slab, vert, overhang, roof");
  });

  it("rejects moves that isn't an array", () => {
    expect(validateEntryShape(validEntry({ moves: "not-an-array" }))).toBe("moves must be an array");
  });
});

describe("painMoves", () => {
  it("accepts an entry with no painMoves", () => {
    expect(validateEntryShape(validEntry())).toBeNull();
  });

  it("accepts a valid pain move (no difficulty field)", () => {
    expect(validateEntryShape(validEntry({ painMoves: [validPainRow()] }))).toBeNull();
  });

  it("ignores a stray difficulty field on a pain move (not validated, not required)", () => {
    expect(validateEntryShape(validEntry({ painMoves: [{ ...validPainRow(), difficulty: "hardest" }] }))).toBeNull();
  });

  it("rejects an invalid limb the same way moves does", () => {
    expect(validateEntryShape(validEntry({ painMoves: [validPainRow({ limb: "elbow" })] }))).toBe("painMoves[0].limb must be one of: hand, foot, knee");
  });

  it("rejects painMoves that isn't an array", () => {
    expect(validateEntryShape(validEntry({ painMoves: {} }))).toBe("painMoves must be an array");
  });
});
```

- [ ] **Step 8: Run the tests, confirm they fail**

Run: `pnpm exec vitest run test/entry-schema.test.js`
Expected: FAIL — no `moves`/`painMoves` validation exists yet.

- [ ] **Step 9: Add `moves`/`painMoves` to the schema and implement row validation**

Add both fields to the `v.object({...})` call, alongside `attemptsToSend`/`rpe` from Step 5:

```js
    attemptsToSend: anyField,
    rpe: anyField,
    moves: anyField,
    painMoves: anyField,
```

Add a shared row-validation helper above `entrySchema` (after the `anyField` declaration, before `export const entrySchema = ...`):

```js
// Shared by moves/painMoves below -- both are child-row lists of the same
// four cascading dimensions (limb/side/holdType/movementStyle/wallAngle);
// moves additionally carries `difficulty`, checked by the caller before
// this runs since painMoves rows never have it. Returns an issue-ready
// message or null, never calls addIssue itself -- both callers need to
// prefix the message with their own field name + row index
// ("moves[0]..." vs "painMoves[0]...").
function moveRowError(row, fieldPrefix) {
  if (typeof row !== "object" || row === null) return `${fieldPrefix} must be an object`;
  if (!VALID_LIMBS.includes(row.limb)) return `${fieldPrefix}.limb must be one of: ${VALID_LIMBS.join(", ")}`;
  if (!VALID_SIDES.includes(row.side)) return `${fieldPrefix}.side must be one of: ${VALID_SIDES.join(", ")}`;
  if (!HOLD_TYPES_BY_LIMB[row.limb].includes(row.holdType)) return `${fieldPrefix}.holdType must be one of: ${HOLD_TYPES_BY_LIMB[row.limb].join(", ")}`;
  if (!MOVEMENT_STYLES_BY_LIMB[row.limb].includes(row.movementStyle)) return `${fieldPrefix}.movementStyle must be one of: ${MOVEMENT_STYLES_BY_LIMB[row.limb].join(", ")}`;
  if (!VALID_WALL_ANGLES.includes(row.wallAngle)) return `${fieldPrefix}.wallAngle must be one of: ${VALID_WALL_ANGLES.join(", ")}`;
  return null;
}

const VALID_MOVE_DIFFICULTIES = ["hardest", "easiest"];
```

Add the validation calls inside the `v.rawCheck(...)` callback, after the `rpe` check added in Step 5:

```js
    if (entry.moves !== undefined && entry.moves !== null) {
      if (!Array.isArray(entry.moves)) {
        addIssue({ message: "moves must be an array", path: fieldPath(entry, "moves") });
      } else {
        for (let i = 0; i < entry.moves.length; i++) {
          const row = entry.moves[i];
          if (typeof row === "object" && row !== null && !VALID_MOVE_DIFFICULTIES.includes(row.difficulty)) {
            addIssue({ message: `moves[${i}].difficulty must be one of: ${VALID_MOVE_DIFFICULTIES.join(", ")}`, path: fieldPath(entry, "moves") });
            return;
          }
          const rowErr = moveRowError(row, `moves[${i}]`);
          if (rowErr) {
            addIssue({ message: rowErr, path: fieldPath(entry, "moves") });
            return;
          }
        }
      }
    }
    if (entry.painMoves !== undefined && entry.painMoves !== null) {
      if (!Array.isArray(entry.painMoves)) {
        addIssue({ message: "painMoves must be an array", path: fieldPath(entry, "painMoves") });
      } else {
        for (let i = 0; i < entry.painMoves.length; i++) {
          const rowErr = moveRowError(entry.painMoves[i], `painMoves[${i}]`);
          if (rowErr) {
            addIssue({ message: rowErr, path: fieldPath(entry, "painMoves") });
            return;
          }
        }
      }
    }
```

- [ ] **Step 10: Run the tests, confirm they pass**

Run: `pnpm exec vitest run test/entry-schema.test.js`
Expected: PASS (all tests)

- [ ] **Step 11: Run the full unit suite to confirm no regressions**

Run: `pnpm test`
Expected: PASS, including the pre-existing `test/logbook.test.js` (its `entry.moves`/`entry.painMoves`/`entry.attemptsToSend`/`entry.rpe` are all `undefined` on every entry it posts, and `anyField`'s `v.optional(v.unknown())` plus the `!== undefined && !== null` guards above mean an absent field is silently valid, same as every pre-existing optional field).

- [ ] **Step 12: Commit**

```bash
git add shared/entry-schema.js test/entry-schema.test.js
git commit -m "Validate attemptsToSend/rpe/moves/painMoves in the shared entry schema"
```

---

## Task 2: `server/lib/d1-resource.js` — add `afterWrite`/`decorateRows` hooks

**Files:**
- Modify: `server/lib/d1-resource.js`
- Test: `test/d1-resource.test.js` (new file — this module currently has no dedicated test file; existing coverage is indirect via `test/logbook.test.js`/`test/places.test.js`/`test/locations.test.js`. The two new hooks are genuinely generic infrastructure, worth their own direct coverage independent of any one table.)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `createD1ResourceHandlers({ table, resourceKey, validateFields, buildRow, rowToJson, excludeDeleted, findDuplicate, afterWrite, decorateRows })` — two new optional parameters. `afterWrite: async (env, id, record) => void`, called once per successful write (fresh insert or tombstone-resurrect), after the row itself is written, before the response list is built. `decorateRows: async (env, userId, rows) => rows`, called on every row list this factory's `handleGet`/`handlePost` are about to return (including the dedup-match and already-exists no-op branches), replacing the returned array with whatever it resolves to.

- [ ] **Step 1: Write the failing tests for both hooks**

Create `test/d1-resource.test.js`:

```js
// Exercises the two generic extension hooks (afterWrite, decorateRows)
// added for #575 Phase 2's entry-data plan -- entries.js (server/api/
// logbook.js) is their real consumer, but these hooks are table-agnostic
// infrastructure, worth testing against a throwaway table rather than only
// indirectly through entries' own much larger test file.
import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { createD1ResourceHandlers } from "../server/lib/d1-resource.js";
import { createAuthedSession, resetAuthTables } from "./support.js";

// "places" already exists as a real D1 table (server/api/places.js's own
// table) with a minimal enough shape (id, user_id, location_id, name,
// area, created_at, updated_at) to drive through this factory directly
// without a fixture table of our own -- location_id has a NOT NULL FK, so
// tests seed a real location first via the same pattern test/places.test.js
// already uses.
async function seedLocation(userId) {
  const id = crypto.randomUUID();
  await env.LOGBOOK_DB.prepare("INSERT INTO locations (id, user_id, name, country) VALUES (?, ?, ?, ?)")
    .bind(id, userId, "Fontainebleau", "France").run();
  return id;
}

function buildRow(record, id, userId) {
  return { id, user_id: userId, location_id: record.locationId, name: record.name, area: record.area ?? "" };
}
function rowToJson(row) {
  return { id: row.id, locationId: row.location_id, name: row.name, area: row.area };
}
async function validateFields() { return null; }

let userId;

beforeEach(async () => {
  await resetAuthTables();
  const { userId: id } = await createAuthedSession();
  userId = id;
});

describe("afterWrite", () => {
  it("is called once with (env, id, record) after a fresh insert", async () => {
    const calls = [];
    const { handlePost } = createD1ResourceHandlers({
      table: "places", resourceKey: "places", validateFields, buildRow, rowToJson,
      afterWrite: async (e, id, record) => { calls.push({ id, record }); },
    });
    const locationId = await seedLocation(userId);
    const record = { locationId, name: "Bas Cuvier" };
    const request = new Request("https://x/", { method: "POST", body: JSON.stringify(record) });
    await handlePost(request, env, userId);

    expect(calls).toHaveLength(1);
    expect(calls[0].record).toEqual(record);
    expect(typeof calls[0].id).toBe("string");
  });

  it("is not called when handlePost short-circuits on a validation error", async () => {
    const calls = [];
    const { handlePost } = createD1ResourceHandlers({
      table: "places", resourceKey: "places",
      validateFields: async () => "always invalid",
      buildRow, rowToJson,
      afterWrite: async () => { calls.push(1); },
    });
    const request = new Request("https://x/", { method: "POST", body: JSON.stringify({ name: "x" }) });
    await handlePost(request, env, userId);

    expect(calls).toHaveLength(0);
  });
});

describe("decorateRows", () => {
  it("replaces the list handleGet returns", async () => {
    const { handlePost, handleGet } = createD1ResourceHandlers({
      table: "places", resourceKey: "places", validateFields, buildRow, rowToJson,
      decorateRows: async (e, uid, rows) => rows.map(r => ({ ...r, decorated: true })),
    });
    const locationId = await seedLocation(userId);
    await handlePost(new Request("https://x/", { method: "POST", body: JSON.stringify({ locationId, name: "Bas Cuvier" }) }), env, userId);

    const res = await handleGet(new Request("https://x/"), env, userId);
    const { places } = await res.json();
    expect(places).toHaveLength(1);
    expect(places[0].decorated).toBe(true);
  });

  it("replaces the list handlePost itself returns", async () => {
    const { handlePost } = createD1ResourceHandlers({
      table: "places", resourceKey: "places", validateFields, buildRow, rowToJson,
      decorateRows: async (e, uid, rows) => rows.map(r => ({ ...r, decorated: true })),
    });
    const locationId = await seedLocation(userId);
    const res = await handlePost(new Request("https://x/", { method: "POST", body: JSON.stringify({ locationId, name: "Bas Cuvier" }) }), env, userId);

    const { places } = await res.json();
    expect(places[0].decorated).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests, confirm they fail**

Run: `pnpm exec vitest run test/d1-resource.test.js`
Expected: FAIL — `afterWrite`/`decorateRows` aren't recognized by `createD1ResourceHandlers` yet, so `calls` stays empty and rows are never decorated.

- [ ] **Step 3: Implement both hooks in `createD1ResourceHandlers`**

In `server/lib/d1-resource.js`, change the factory's signature (line 129):

```js
export function createD1ResourceHandlers({ table, resourceKey, validateFields, buildRow, rowToJson, excludeDeleted = false, findDuplicate, afterWrite, decorateRows }) {
```

Add a small local helper right after the signature, before `handleGet`:

```js
  // Both hooks are no-ops by default (afterWrite: nothing extra to do;
  // decorateRows: identity) so every existing caller (places.js/
  // locations.js) is completely unaffected -- only entries.js (this plan's
  // real consumer) passes either.
  async function decorate(rows) {
    return decorateRows ? await decorateRows(env, userId, rows) : rows;
  }
```

Wait — `decorate` needs `env`/`userId` in scope, which `handleGet`/`handlePost` receive as parameters, not this outer closure. Define it inline inside each function instead of as a shared closure (there's no single `env`/`userId` at the factory's own scope). Replace the plan above: **do not** add the `decorate` helper shown just above; instead call `decorateRows` directly at each of the four `handleGet`/`handlePost` return points below.

In `handleGet` (existing code, lines 134–142), change both `return json(...)` statements:

```js
  async function handleGet(request, env, userId) {
    const since = new URL(request.url).searchParams.get("since");
    if (since !== null) {
      const { rows, cursor } = await listChangedForUser(env, table, userId, rowToJson, Number(since));
      const decorated = decorateRows ? await decorateRows(env, userId, rows) : rows;
      return json({ [resourceKey]: decorated, cursor }, 200, { "Cache-Control": "no-store" });
    }
    const list = await listForUser(env, table, userId, rowToJson, { excludeDeleted });
    const decoratedList = decorateRows ? await decorateRows(env, userId, list) : list;
    return json({ [resourceKey]: decoratedList }, 200, { "Cache-Control": "no-store" });
  }
```

In `handlePost` (existing code, lines 144–210), thread both hooks through every return point:

```js
  async function handlePost(request, env, userId) {
    const parsed = await parseJsonBody(request);
    if (!parsed.ok) return parsed.response;
    const record = parsed.body;

    const err = await validateFields(record, env, userId);
    if (err) return json({ error: err }, 400);

    if (findDuplicate) {
      const duplicate = await findDuplicate(env, userId, record);
      if (duplicate) {
        const list = await listForUser(env, table, userId, rowToJson, { excludeDeleted });
        const decorated = decorateRows ? await decorateRows(env, userId, list) : list;
        return json({ [resourceKey]: decorated, dedupedTo: duplicate.id }, 200);
      }
    }

    const id = typeof record.id === "string" && record.id ? record.id : crypto.randomUUID();

    const existing = await findOwnedRow(env, table, id, userId, excludeDeleted ? { includeDeletedAt: true } : {});
    if (existing) {
      if (excludeDeleted && existing.deleted_at !== null) {
        const row = buildRow(record, id, userId);
        const columns = Object.keys(row).filter(c => c !== "id" && c !== "user_id");
        await env.LOGBOOK_DB
          .prepare(`UPDATE ${table} SET ${columns.map(c => `${c} = ?`).join(", ")}, deleted_at = NULL WHERE id = ? AND user_id = ?`)
          .bind(...columns.map(c => row[c]), id, userId)
          .run();
        if (afterWrite) await afterWrite(env, id, record);
        const list = await listForUser(env, table, userId, rowToJson, { excludeDeleted });
        const decorated = decorateRows ? await decorateRows(env, userId, list) : list;
        return json({ [resourceKey]: decorated }, 201);
      }
      const list = await listForUser(env, table, userId, rowToJson, { excludeDeleted });
      const decorated = decorateRows ? await decorateRows(env, userId, list) : list;
      return json({ [resourceKey]: decorated }, 200);
    }

    await insertRow(env, table, buildRow(record, id, userId));
    if (afterWrite) await afterWrite(env, id, record);

    const list = await listForUser(env, table, userId, rowToJson, { excludeDeleted });
    const decorated = decorateRows ? await decorateRows(env, userId, list) : list;
    return json({ [resourceKey]: decorated }, 201);
  }
```

Note on the "already exists, not a resurrect" branch (the `return json({ [resourceKey]: list }, 200);` mid-function): `afterWrite` is deliberately **not** called there — that branch means "this exact id already has a live row" (a true idempotent replay of an already-successful create), not a new or resurrected write, so there is nothing new to diff-and-replace child rows against.

- [ ] **Step 4: Run the tests, confirm they pass**

Run: `pnpm exec vitest run test/d1-resource.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Run the full unit suite to confirm no regressions**

Run: `pnpm test`
Expected: PASS — `places.js`/`locations.js` call `createD1ResourceHandlers` without `afterWrite`/`decorateRows`, so both stay `undefined` and every `if (afterWrite)`/`decorateRows ? ... : list` branch takes its no-op path, identical to today's behavior.

- [ ] **Step 6: Commit**

```bash
git add server/lib/d1-resource.js test/d1-resource.test.js
git commit -m "Add afterWrite/decorateRows opt-in hooks to the D1 resource factory"
```

---

## Task 3: `server/api/logbook.js` — write and read `entry_moves`/`entry_pain_moves`

**Files:**
- Modify: `server/api/logbook.js`
- Test: `test/logbook.test.js` (existing file — add new `describe` blocks; do not modify existing tests, per this plan's Global Constraints note that they're already confirmed unaffected)

**Interfaces:**
- Consumes: Task 1's `validateEntryShape` (unchanged call site, already imported), Task 2's `afterWrite`/`decorateRows` hooks.
- Produces: `buildRow(entry, id, userId)` now also maps `attempts_to_send`/`rpe`. `rowToJson(row)` now also maps `attemptsToSend`/`rpe`. Every entries read path now returns `moves: [...]`/`painMoves: [...]` (each item shaped `{id, difficulty?, limb, side, holdType, movementStyle, wallAngle}`) on every entry object. Client code (Task 4/5) can rely on these two arrays always being present (never `undefined`) on any entry object read from any of this file's endpoints.

- [ ] **Step 1: Write the failing tests for `attemptsToSend`/`rpe` round-tripping**

Append to `test/logbook.test.js` (after the existing `describe("handleGet", ...)` block, i.e. after line 88):

```js
describe("attemptsToSend / rpe", () => {
  it("round-trips attemptsToSend and rpe through create", async () => {
    const created = await (await post({ ...validEntry(), attemptsToSend: 5, rpe: 80 })).json();
    expect(created.entries[0].attemptsToSend).toBe(5);
    expect(created.entries[0].rpe).toBe(80);
  });

  it("defaults both to null when omitted", async () => {
    const created = await (await post(validEntry())).json();
    expect(created.entries[0].attemptsToSend).toBeNull();
    expect(created.entries[0].rpe).toBeNull();
  });

  it("round-trips both through edit", async () => {
    const created = await (await post(validEntry())).json();
    const updated = await (await put({ ...created.entries[0], attemptsToSend: 3, rpe: 60 })).json();
    expect(updated.entries[0].attemptsToSend).toBe(3);
    expect(updated.entries[0].rpe).toBe(60);
  });

  it("rejects an invalid rpe on create", async () => {
    const res = await post({ ...validEntry(), rpe: 55 });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("rpe must be a multiple of 10 between 0 and 100");
  });
});
```

- [ ] **Step 2: Run the tests, confirm they fail**

Run: `pnpm exec vitest run test/logbook.test.js -t "attemptsToSend / rpe"`
Expected: FAIL — `attemptsToSend`/`rpe` are `undefined` in every response today (neither `buildRow` nor `rowToJson` know about them), and the invalid-rpe create isn't rejected yet by this endpoint's own validation pass-through (Task 1 already makes `validateEntryShape` reject it, but this confirms the 400 actually surfaces through this file's own `handlePost`/`handlePut` error path).

- [ ] **Step 3: Add both fields to `buildRow`/`rowToJson`**

In `server/api/logbook.js`, modify `buildRow` (lines 22–43):

```js
export function buildRow(entry, id, userId) {
  return {
    id,
    user_id: userId,
    place_id: entry.placeId,
    name: entry.name,
    grade: entry.grade,
    discipline_id: entry.type,
    status_id: entry.status,
    first_attempt: entry.status === "send" && entry.firstAttempt ? 1 : 0,
    date: entry.date || null,
    video: entry.video || null,
    notes: entry.notes || null,
    attempts_to_send: entry.attemptsToSend ?? null,
    rpe: entry.rpe ?? null,
    sync_cursor: Date.now(),
  };
}
```

Modify `rowToJson` (lines 45–58):

```js
export function rowToJson(row) {
  return {
    id: row.id,
    name: row.name,
    grade: row.grade,
    placeId: row.place_id,
    type: row.discipline_id,
    status: row.status_id,
    firstAttempt: !!row.first_attempt,
    date: row.date,
    video: row.video,
    notes: row.notes,
    attemptsToSend: row.attempts_to_send,
    rpe: row.rpe,
  };
}
```

- [ ] **Step 4: Run the tests, confirm they pass**

Run: `pnpm exec vitest run test/logbook.test.js -t "attemptsToSend / rpe"`
Expected: PASS (4 tests)

- [ ] **Step 5: Run the full unit suite to confirm no regressions**

Run: `pnpm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add server/api/logbook.js test/logbook.test.js
git commit -m "Round-trip attemptsToSend/rpe through the entries API"
```

- [ ] **Step 7: Write the failing tests for `entry_moves`/`entry_pain_moves` write + read**

Append to `test/logbook.test.js`:

```js
function validMoveRow(overrides = {}) {
  return { difficulty: "hardest", limb: "hand", side: "left", holdType: "crimp", movementStyle: "static", wallAngle: "overhang", ...overrides };
}
function validPainRow(overrides = {}) {
  return { limb: "foot", side: "right", holdType: "toe-hook", movementStyle: "dynamic", wallAngle: "slab", ...overrides };
}

describe("entry_moves / entry_pain_moves", () => {
  it("defaults both to empty arrays when omitted", async () => {
    const created = await (await post(validEntry())).json();
    expect(created.entries[0].moves).toEqual([]);
    expect(created.entries[0].painMoves).toEqual([]);
  });

  it("writes and reads back moves on create", async () => {
    const created = await (await post({ ...validEntry(), moves: [validMoveRow()] })).json();
    expect(created.entries[0].moves).toHaveLength(1);
    expect(created.entries[0].moves[0]).toMatchObject({ difficulty: "hardest", limb: "hand", side: "left", holdType: "crimp", movementStyle: "static", wallAngle: "overhang" });
    expect(typeof created.entries[0].moves[0].id).toBe("string");
  });

  it("writes and reads back painMoves on create", async () => {
    const created = await (await post({ ...validEntry(), painMoves: [validPainRow()] })).json();
    expect(created.entries[0].painMoves).toHaveLength(1);
    expect(created.entries[0].painMoves[0]).toMatchObject({ limb: "foot", side: "right", holdType: "toe-hook", movementStyle: "dynamic", wallAngle: "slab" });
  });

  it("returns moves/painMoves for every entry via a plain GET", async () => {
    await post({ ...validEntry(), moves: [validMoveRow()] });
    const { entries } = await (await get()).json();
    expect(entries[0].moves).toHaveLength(1);
  });

  it("diffs-and-replaces moves on edit, not merges", async () => {
    const created = await (await post({ ...validEntry(), moves: [validMoveRow()] })).json();
    const updated = await (await put({ ...created.entries[0], moves: [validMoveRow({ difficulty: "easiest", limb: "knee", side: "left", holdType: "kneebar", movementStyle: "static" })] })).json();
    expect(updated.entries[0].moves).toHaveLength(1);
    expect(updated.entries[0].moves[0].difficulty).toBe("easiest");
    expect(updated.entries[0].moves[0].limb).toBe("knee");
  });

  it("clears moves on edit when the new list is empty", async () => {
    const created = await (await post({ ...validEntry(), moves: [validMoveRow()] })).json();
    const updated = await (await put({ ...created.entries[0], moves: [] })).json();
    expect(updated.entries[0].moves).toEqual([]);
  });

  it("leaves an entry's moves in place after a soft delete (not cascaded)", async () => {
    const created = await (await post({ ...validEntry(), moves: [validMoveRow()] })).json();
    const id = created.entries[0].id;
    await del(id);
    const { results } = await env.LOGBOOK_DB.prepare("SELECT * FROM entry_moves WHERE entry_id = ?").bind(id).all();
    expect(results).toHaveLength(1);
  });

  it("rejects an invalid move row on create with a 400", async () => {
    const res = await post({ ...validEntry(), moves: [validMoveRow({ wallAngle: "ceiling" })] });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("moves[0].wallAngle must be one of: slab, vert, overhang, roof");
  });
});
```

This test file needs `env` imported for the direct-D1 assertion in the last-but-one test — confirm the existing top-of-file `import { env } from "cloudflare:workers";` (line 6) already covers it; no new import needed.

- [ ] **Step 8: Run the tests, confirm they fail**

Run: `pnpm exec vitest run test/logbook.test.js -t "entry_moves / entry_pain_moves"`
Expected: FAIL — no child-row read/write plumbing exists yet, so `moves`/`painMoves` are `undefined` on every response.

- [ ] **Step 9: Implement the write path (`replaceChildRows` + `afterWrite`) and read path (`attachChildRows` + `decorateRows`)**

In `server/api/logbook.js`, add near the top (after the existing imports, before `validateFields`):

```js
import { createD1ResourceHandlers, findOwnedRow, insertRow, listChangedForUser, listForUser } from "../lib/d1-resource.js";
```

(This changes the existing import on line 2 to also pull in `insertRow`, previously only imported by `d1-resource.js` itself for internal use.)

Add the child-row mapping + write/read helpers, after `rowToJsonWithDeleted` (after line 68), before `createD1ResourceHandlers` is called:

```js
// #575 Phase 2 entry-data plan -- entry_moves/entry_pain_moves (#36/#572)
// are child tables of entries, not resources of their own, so they don't
// go through d1-resource.js's own createD1ResourceHandlers -- this is the
// entries-specific plumbing that hooks into it instead (afterWrite/
// decorateRows, server/lib/d1-resource.js).
function buildMoveRow(record, id, entryId) {
  return { id, entry_id: entryId, difficulty: record.difficulty, limb: record.limb, side: record.side, hold_type: record.holdType, movement_style: record.movementStyle, wall_angle: record.wallAngle };
}
function buildPainMoveRow(record, id, entryId) {
  return { id, entry_id: entryId, limb: record.limb, side: record.side, hold_type: record.holdType, movement_style: record.movementStyle, wall_angle: record.wallAngle };
}
function moveRowToJson(row) {
  return { id: row.id, difficulty: row.difficulty, limb: row.limb, side: row.side, holdType: row.hold_type, movementStyle: row.movement_style, wallAngle: row.wall_angle };
}
function painMoveRowToJson(row) {
  return { id: row.id, limb: row.limb, side: row.side, holdType: row.hold_type, movementStyle: row.movement_style, wallAngle: row.wall_angle };
}

// Diff-and-replace (design doc's own term, docs/superpowers/specs/2026-08-
// 27-performance-insights-ui-design.md "Offline" section): the whole
// current list from the client is authoritative for this entry, so every
// write clears and rebuilds rather than trying to reconcile individual
// row changes. One env.LOGBOOK_DB.batch() call, not sequential awaits --
// a partial failure between the DELETE and its INSERTs would otherwise
// leave this entry's tags empty rather than either fully old or fully new.
async function replaceChildRows(env, table, entryId, records, buildRow) {
  const statements = [
    env.LOGBOOK_DB.prepare(`DELETE FROM ${table} WHERE entry_id = ?`).bind(entryId),
    ...records.map(record => {
      const row = buildRow(record, crypto.randomUUID(), entryId);
      const columns = Object.keys(row);
      return env.LOGBOOK_DB.prepare(`INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`).bind(...columns.map(c => row[c]));
    }),
  ];
  await env.LOGBOOK_DB.batch(statements);
}

async function replaceMovesAndPainMoves(env, entryId, record) {
  await replaceChildRows(env, "entry_moves", entryId, record.moves ?? [], buildMoveRow);
  await replaceChildRows(env, "entry_pain_moves", entryId, record.painMoves ?? [], buildPainMoveRow);
}

// Batch-fetched, not one query per entry -- avoids an N+1 query per
// entries response. Safe against an empty `rows` (returns immediately,
// no query at all) since IN (...) with zero placeholders is invalid SQL.
async function attachChildRows(rows, env) {
  if (rows.length === 0) return rows;
  const ids = rows.map(r => r.id);
  const placeholders = ids.map(() => "?").join(",");
  const [movesRes, painRes] = await Promise.all([
    env.LOGBOOK_DB.prepare(`SELECT * FROM entry_moves WHERE entry_id IN (${placeholders})`).bind(...ids).all(),
    env.LOGBOOK_DB.prepare(`SELECT * FROM entry_pain_moves WHERE entry_id IN (${placeholders})`).bind(...ids).all(),
  ]);
  const movesByEntry = {};
  for (const row of movesRes.results) (movesByEntry[row.entry_id] ??= []).push(moveRowToJson(row));
  const painByEntry = {};
  for (const row of painRes.results) (painByEntry[row.entry_id] ??= []).push(painMoveRowToJson(row));
  return rows.map(row => ({ ...row, moves: movesByEntry[row.id] ?? [], painMoves: painByEntry[row.id] ?? [] }));
}
```

Change the `createD1ResourceHandlers` call (lines 76–84) to pass the two new hooks:

```js
export const { handlePost } = createD1ResourceHandlers({
  table: "entries",
  resourceKey: "entries",
  validateFields,
  buildRow,
  rowToJson,
  excludeDeleted: true,
  afterWrite: (env, id, record) => replaceMovesAndPainMoves(env, id, record),
  decorateRows: (env, userId, rows) => attachChildRows(rows, env),
});
```

Update `handleGet` (lines 115–178) to decorate every branch's rows before returning. The delta branch (lines 126–131):

```js
  const since = url.searchParams.get("since");
  if (since !== null) {
    if (!userId) return json({ entries: [], cursor: Number(since) }, 200, { "Cache-Control": "no-store" });
    const { rows, cursor } = await listChangedForUser(env, "entries", userId, rowToJsonWithDeleted, Number(since));
    const decorated = await attachChildRows(rows, env);
    return json({ entries: decorated, cursor }, 200, { "Cache-Control": "no-store" });
  }
```

The flat "everything" branch (lines 143–145):

```js
    const limit = url.searchParams.get("limit");
    if (limit === null) {
      const rows = await listForUser(env, "entries", userId, rowToJson, { excludeDeleted: true });
      const decorated = await attachChildRows(rows, env);
      return json({ entries: decorated }, 200, { "Cache-Control": "no-store" });
    }
```

The flat chunked branch (lines 155–162):

```js
    const offset = Number(url.searchParams.get("offset")) || 0;
    const { results } = await env.LOGBOOK_DB
      .prepare(`SELECT *, COUNT(*) OVER() AS total, MAX(sync_cursor) OVER() AS max_cursor FROM entries WHERE user_id = ? AND deleted_at IS NULL ORDER BY created_at LIMIT ? OFFSET ?`)
      .bind(userId, Number(limit), offset)
      .all();
    const total = results[0]?.total ?? 0;
    const cursor = results[0]?.max_cursor ?? 0;
    const decorated = await attachChildRows(results.map(rowToJson), env);
    return json({ entries: decorated, total, cursor }, 200, { "Cache-Control": "no-store" });
```

The per-location branch (lines 168–177):

```js
  const { results } = await env.LOGBOOK_DB
    .prepare(`
      SELECT e.* FROM entries e JOIN places p ON e.place_id = p.id
      WHERE e.user_id = ? AND p.location_id = ? AND e.deleted_at IS NULL
      ORDER BY e.created_at LIMIT ? OFFSET ?
    `)
    .bind(userId, locationId, limit, offset)
    .all();

  const decorated = await attachChildRows(results.map(rowToJson), env);
  return json({ entries: decorated }, 200, { "Cache-Control": "no-store" });
```

Update `handlePut` (lines 180–205) to write child rows and decorate its response:

```js
export async function handlePut(request, env, userId) {
  const parsed = await parseJsonBody(request);
  if (!parsed.ok) return parsed.response;
  const entry = parsed.body;

  if (!entry.id) return json({ error: "Missing required field: id" }, 400);
  const err = await validateFields(entry, env, userId);
  if (err) return json({ error: err }, 400);

  const existing = await findOwnedRow(env, "entries", entry.id, userId, { excludeDeleted: true });
  if (!existing) return json({ error: "Entry not found" }, 404);

  const row = buildRow(entry, entry.id, userId);
  const columns = Object.keys(row).filter(c => c !== "id" && c !== "user_id");
  await env.LOGBOOK_DB
    .prepare(`UPDATE entries SET ${columns.map(c => `${c} = ?`).join(", ")}, updated_at = datetime('now') WHERE id = ? AND user_id = ?`)
    .bind(...columns.map(c => row[c]), entry.id, userId)
    .run();
  await replaceMovesAndPainMoves(env, entry.id, entry);

  const rows = await listForUser(env, "entries", userId, rowToJson, { excludeDeleted: true });
  const decorated = await attachChildRows(rows, env);
  return json({ entries: decorated });
}
```

Update `handleDelete` (lines 212–231) to decorate its response (no child-row write — see this plan's Global Constraints on why a soft delete leaves child rows in place):

```js
export async function handleDelete(request, env, userId) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return json({ error: "Missing required field: id" }, 400);

  const now = Date.now();
  await env.LOGBOOK_DB
    .prepare(`UPDATE entries SET deleted_at = ?, sync_cursor = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?`)
    .bind(now, now, id, userId)
    .run();

  const rows = await listForUser(env, "entries", userId, rowToJson, { excludeDeleted: true });
  const decorated = await attachChildRows(rows, env);
  return json({ entries: decorated });
}
```

- [ ] **Step 10: Run the tests, confirm they pass**

Run: `pnpm exec vitest run test/logbook.test.js -t "entry_moves / entry_pain_moves"`
Expected: PASS (8 tests)

- [ ] **Step 11: Run the full unit suite to confirm no regressions**

Run: `pnpm test`
Expected: PASS — including every pre-existing `test/logbook.test.js` test (per this plan's Global Constraints note, none hardcode a literal full-entry-shape that the new `attemptsToSend`/`rpe`/`moves`/`painMoves` fields would break).

- [ ] **Step 12: Commit**

```bash
git add server/api/logbook.js test/logbook.test.js
git commit -m "Diff-and-replace entry_moves/entry_pain_moves on every entry write"
```

---

## Task 4: `client/entry-form.js` + `public/log/index.html` — Exertion and Attempts

**Files:**
- Modify: `client/entry-form.js`
- Modify: `public/log/index.html`
- Test: `test/client/` — no new unit test file (this task is DOM-wiring, not pure logic; covered by Task 6's e2e tests instead, matching this codebase's own stated testing pattern for entry-form behavior — see the design doc's "Testing" section: "Playwright e2e... for the entry form's new section").

**Interfaces:**
- Consumes: nothing new from Tasks 1–3 directly (this task only touches the client's own DOM/submit-payload code; the schema/API plumbing those tasks built is what makes the new `attemptsToSend`/`rpe` fields actually persist once this task starts sending them).
- Produces: the submitted `entry` object (built inside `entryForm`'s submit handler) gains `attemptsToSend`/`rpe` fields. `open(entry)` pre-populates both from an existing entry. Task 5 adds `moves`/`painMoves` to this same object, in the same places, following the pattern this task establishes.

- [ ] **Step 1: Add the Exertion and Attempts markup to `public/log/index.html`**

Insert between the closing `</fieldset>` of `#status-group` (line 159) and the Notes label div (line 161):

```html
      <div class="mt-[1.1rem]" id="exertion-field" hidden>
        <div class="text-[.72rem] font-semibold uppercase tracking-[.07em] text-muted mb-2">Exertion</div>
        <input type="range" class="w-full accent-accent" id="exertion-slider" min="0" max="100" step="10" value="50" aria-describedby="exertion-value">
        <div class="text-center text-[.85rem] text-foreground mt-1" id="exertion-value">50%</div>
      </div>

      <div class="mt-[1.1rem]">
        <div class="text-[.72rem] font-semibold uppercase tracking-[.07em] text-muted mb-2">Attempts</div>
        <div class="flex items-center justify-center gap-3">
          <button type="button" class="flex-[0_0_2.75rem] h-[2.75rem] flex items-center justify-center border border-border rounded-app bg-surface text-foreground text-[1.2rem] cursor-pointer hover:border-accent active:scale-[.94] disabled:opacity-[.45] disabled:cursor-not-allowed" id="attempts-minus" aria-label="Decrease attempts">−</button>
          <span class="w-[3ch] text-center font-bold text-[1.1rem]" id="attempts-count">0</span>
          <button type="button" class="flex-[0_0_2.75rem] h-[2.75rem] flex items-center justify-center border border-border rounded-app bg-surface text-foreground text-[1.2rem] cursor-pointer hover:border-accent active:scale-[.94]" id="attempts-plus" aria-label="Increase attempts">+</button>
        </div>
      </div>
```

`accent-accent` is Tailwind's `accent-color` utility applied to this app's own `--color-accent` token — matches how the rest of the form already themes native controls (confirm this utility already resolves via the app's Tailwind config; if not already available, use inline `style="accent-color: var(--color-accent)"` instead, same visual result).

- [ ] **Step 2: Wire up the Exertion slider in `client/entry-form.js`**

Add DOM references, in the existing block of `getElementById` calls (after `statusGroup` on line 49):

```js
  const statusGroup = document.getElementById("status-group");
  const exertionField = document.getElementById("exertion-field");
  const exertionSlider = document.getElementById("exertion-slider");
  const exertionValue = document.getElementById("exertion-value");
  const attemptsMinus = document.getElementById("attempts-minus");
  const attemptsPlus = document.getElementById("attempts-plus");
  const attemptsCount = document.getElementById("attempts-count");
```

Add the visibility-toggle logic, right after the existing `statusGroup.addEventListener("change", ...)` block (after line 132):

```js
  statusGroup.addEventListener("change", e => {
    if (e.target.name !== "entry-status") return;
    const value = e.target.value;
    selectedStatus = value === "flash" ? "send" : value;
    isFlash = value === "flash";
    updateExertionVisibility();
  });

  // Design doc's own rule (docs/superpowers/specs/2026-08-27-performance-
  // insights-ui-design.md "Exertion") -- visible only when the Status
  // radio group has Send checked (selectedStatus === "send", true for
  // both the plain Send and Flash buttons -- Flash isn't its own status
  // value, see isFlash above). Genuinely removed from the DOM's visible
  // flow (hidden attribute) rather than shown-but-disabled, since a field
  // that isn't there needs no explanation -- exertion is a property of
  // having sent the climb, not of an unsent attempt.
  function updateExertionVisibility() {
    exertionField.hidden = selectedStatus !== "send";
  }

  exertionSlider.addEventListener("input", () => {
    exertionValue.textContent = `${exertionSlider.value}%`;
  });
```

Add the Attempts stepper wiring, right after the Exertion block above:

```js
  // #574 -- plain form field for v1 (no immediate-save); value only
  // persists when the rest of the entry is submitted, same as every
  // other field. Always visible regardless of status -- a project
  // accumulates attempts before it's eventually sent, same field either
  // way.
  let attemptsValue = 0;
  function renderAttempts() {
    attemptsCount.textContent = String(attemptsValue);
    attemptsMinus.disabled = attemptsValue <= 0;
  }
  attemptsMinus.addEventListener("click", () => { attemptsValue = Math.max(0, attemptsValue - 1); renderAttempts(); });
  attemptsPlus.addEventListener("click", () => { attemptsValue += 1; renderAttempts(); });
```

- [ ] **Step 3: Pre-populate both fields in `open(entry)`**

In the `open(entry)` function, after the existing `setStatusToggle(...)` call (line 181):

```js
    setStatusToggle(entry?.status ?? "send", Boolean(entry?.firstAttempt));
    updateExertionVisibility();
    exertionSlider.value = entry?.rpe ?? 50;
    exertionValue.textContent = `${exertionSlider.value}%`;
    attemptsValue = entry?.attemptsToSend ?? 0;
    renderAttempts();
```

- [ ] **Step 4: Add both fields to the submitted entry object**

In the submit handler, add to the `entry` object literal (after `video: videoInput.value.trim() || null,` on line 213):

```js
      video:  videoInput.value.trim() || null,
      rpe: selectedStatus === "send" ? Number(exertionSlider.value) : null,
      attemptsToSend: attemptsValue,
```

`rpe` is `null` when Status isn't Send — the field wasn't visible/editable in that state, so nothing meaningful was captured; sending the slider's stale leftover value would misrepresent an untouched control as a real answer.

- [ ] **Step 5: Manual verification (no automated test in this task — Task 6 covers this in e2e)**

Run: `pnpm dev` (or `wrangler dev` per this repo's own dev workflow), open the app, open the Add Entry modal.
Expected: Exertion slider is **visible** by default (Send is the default-checked status). Switching Status to Project/Check out/Archived hides the Exertion slider; switching back to Send or Flash shows it again, defaulting to 50%. Attempts stepper is always visible, starts at 0, `−` is disabled at 0.

- [ ] **Step 6: Commit**

```bash
git add client/entry-form.js public/log/index.html
git commit -m "Add Exertion slider and Attempts stepper to the entry form"
```

---

## Task 5: `client/entry-form.js` + `public/log/index.html` — Move difficulty and Pain/injury

**Files:**
- Create: `client/move-tagging.js` — the shared cascading-dropdown row-list widget
- Test: `test/client/move-tagging.test.js`
- Modify: `client/entry-form.js`
- Modify: `public/log/index.html`

**Interfaces:**
- Consumes: `HOLD_TYPES_BY_LIMB`, `MOVEMENT_STYLES_BY_LIMB`, `VALID_LIMBS`, `VALID_SIDES`, `VALID_WALL_ANGLES` from Task 1's `shared/entry-schema.js`.
- Produces: `createMoveRowList({ listEl, addBtnEl, hasDifficulty, defaultDifficulty })` (exported from `client/move-tagging.js`) → `{ getRows(), setRows(rows), reset() }`. `getRows()` returns an array of plain objects (`{difficulty?, limb, side, holdType, movementStyle, wallAngle}`) suitable for direct assignment to the submitted entry's `moves`/`painMoves` arrays. `setRows(rows)` replaces the list's contents (used by `open(entry)` to pre-populate on edit). `reset()` clears to zero rows (used by `open(null)`/add mode).

- [ ] **Step 1: Write the failing tests for `createMoveRowList`**

Create `test/client/move-tagging.test.js`:

```js
// @vitest-environment happy-dom
//
// Unlike server-side tests, this module renders real DOM (select options,
// row cards) and needs a document -- the Cloudflare Workers pool
// (vitest.config.js's default for test/**/*.test.js) has none. happy-dom
// is already a project dependency (confirmed via package.json) used the
// same way by other client-side DOM tests in test/client/.
import { beforeEach, describe, expect, it } from "vitest";
import { createMoveRowList } from "../../client/move-tagging.js";

let listEl, addBtnEl;

beforeEach(() => {
  document.body.innerHTML = `<div id="list"></div><button id="add"></button>`;
  listEl = document.getElementById("list");
  addBtnEl = document.getElementById("add");
});

describe("createMoveRowList", () => {
  it("starts with zero rows", () => {
    const widget = createMoveRowList({ listEl, addBtnEl, hasDifficulty: false });
    expect(widget.getRows()).toEqual([]);
  });

  it("adds a row with sensible defaults when the add button is clicked", () => {
    const widget = createMoveRowList({ listEl, addBtnEl, hasDifficulty: false });
    addBtnEl.click();
    const rows = widget.getRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ limb: "hand", side: "left", wallAngle: "slab" });
  });

  it("carries a difficulty field when hasDifficulty + defaultDifficulty are set", () => {
    const widget = createMoveRowList({ listEl, addBtnEl, hasDifficulty: true, defaultDifficulty: "hardest" });
    addBtnEl.click();
    expect(widget.getRows()[0].difficulty).toBe("hardest");
  });

  it("omits difficulty entirely when hasDifficulty is false", () => {
    const widget = createMoveRowList({ listEl, addBtnEl, hasDifficulty: false });
    addBtnEl.click();
    expect(widget.getRows()[0].difficulty).toBeUndefined();
  });

  it("removes a row when its remove button is clicked", () => {
    const widget = createMoveRowList({ listEl, addBtnEl, hasDifficulty: false });
    addBtnEl.click();
    addBtnEl.click();
    expect(widget.getRows()).toHaveLength(2);
    listEl.querySelector("[data-remove-row]").click();
    expect(widget.getRows()).toHaveLength(1);
  });

  it("re-filters hold type and movement style options when limb changes, defaulting to the new limb's first option", () => {
    const widget = createMoveRowList({ listEl, addBtnEl, hasDifficulty: false });
    addBtnEl.click();
    const limbSelect = listEl.querySelector('[data-field="limbSide"]');
    limbSelect.value = "foot-right";
    limbSelect.dispatchEvent(new Event("change", { bubbles: true }));

    const row = widget.getRows()[0];
    expect(row.limb).toBe("foot");
    expect(row.side).toBe("right");
    expect(row.holdType).toBe("toe-hook");
    expect(["static", "dynamic"]).toContain(row.movementStyle);
    expect(row.movementStyle).not.toBe("lockoff");
  });

  it("setRows() replaces the current rows and reflects them in getRows()", () => {
    const widget = createMoveRowList({ listEl, addBtnEl, hasDifficulty: true });
    addBtnEl.click();
    widget.setRows([
      { difficulty: "easiest", limb: "knee", side: "left", holdType: "kneebar", movementStyle: "static", wallAngle: "roof" },
    ]);
    const rows = widget.getRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({ difficulty: "easiest", limb: "knee", side: "left", holdType: "kneebar", movementStyle: "static", wallAngle: "roof" });
  });

  it("reset() clears to zero rows", () => {
    const widget = createMoveRowList({ listEl, addBtnEl, hasDifficulty: false });
    addBtnEl.click();
    addBtnEl.click();
    widget.reset();
    expect(widget.getRows()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests, confirm they fail**

Run: `pnpm exec vitest run test/client/move-tagging.test.js`
Expected: FAIL — `client/move-tagging.js` doesn't exist yet (module not found).

- [ ] **Step 3: Implement `client/move-tagging.js`**

```js
// Shared cascading-dropdown row-list widget (#575 Phase 2 entry-data
// plan) -- one implementation, two instances on the entry form: Move
// difficulty's Hardest/Easiest lists (hasDifficulty: true, one instance
// each) and Pain/injury's single list (hasDifficulty: false). Per the
// design doc's own "Pain / injury" section: "the cascading-dropdown UI
// component... is reused as-is, same code, DRY."
//
// The "Limb" dropdown combines limb+side into six options (see this
// plan's own Global Constraints ruling) -- the design doc's 4-visible-
// field grid (Limb, Hold type, Movement, Wall angle) only reconciles with
// the 5-column schema (limb+side both always required) this way.
import { escapeHtml } from "./escape-html.js";
import { HOLD_TYPES_BY_LIMB, MOVEMENT_STYLES_BY_LIMB, VALID_WALL_ANGLES } from "../shared/entry-schema.js";

const LIMB_SIDE_OPTIONS = [
  { value: "hand-left", limb: "hand", side: "left", label: "Left Hand" },
  { value: "hand-right", limb: "hand", side: "right", label: "Right Hand" },
  { value: "foot-left", limb: "foot", side: "left", label: "Left Foot" },
  { value: "foot-right", limb: "foot", side: "right", label: "Right Foot" },
  { value: "knee-left", limb: "knee", side: "left", label: "Left Knee" },
  { value: "knee-right", limb: "knee", side: "right", label: "Right Knee" },
];

function limbSideOption(value) {
  return LIMB_SIDE_OPTIONS.find(o => o.value === value) ?? LIMB_SIDE_OPTIONS[0];
}

function optionsHtml(values, selected) {
  return values.map(v => `<option value="${escapeHtml(v)}"${v === selected ? " selected" : ""}>${escapeHtml(v)}</option>`).join("");
}

function rowHtml(row) {
  const { limb, side, holdType, movementStyle, wallAngle } = row;
  const limbSideValue = `${limb}-${side}`;
  return `<div class="row-card mb-2" data-move-row>
    <button type="button" class="border-none bg-transparent cursor-pointer text-muted text-[.9rem] mb-2 hover:text-foreground" data-remove-row aria-label="Remove move">✕ Remove</button>
    <div class="grid gap-2" style="grid-template-columns: repeat(auto-fit, minmax(85px, 1fr));">
      <label class="block">
        <span class="text-[.65rem] text-muted block mb-1">Limb</span>
        <select class="w-full bg-surface border border-border rounded-app px-2 py-1 text-[.85rem]" data-field="limbSide">
          ${LIMB_SIDE_OPTIONS.map(o => `<option value="${o.value}"${o.value === limbSideValue ? " selected" : ""}>${escapeHtml(o.label)}</option>`).join("")}
        </select>
      </label>
      <label class="block">
        <span class="text-[.65rem] text-muted block mb-1">Hold type</span>
        <select class="w-full bg-surface border border-border rounded-app px-2 py-1 text-[.85rem]" data-field="holdType">
          ${optionsHtml(HOLD_TYPES_BY_LIMB[limb], holdType)}
        </select>
      </label>
      <label class="block">
        <span class="text-[.65rem] text-muted block mb-1">Movement</span>
        <select class="w-full bg-surface border border-border rounded-app px-2 py-1 text-[.85rem]" data-field="movementStyle">
          ${optionsHtml(MOVEMENT_STYLES_BY_LIMB[limb], movementStyle)}
        </select>
      </label>
      <label class="block">
        <span class="text-[.65rem] text-muted block mb-1">Wall angle</span>
        <select class="w-full bg-surface border border-border rounded-app px-2 py-1 text-[.85rem]" data-field="wallAngle">
          ${optionsHtml(VALID_WALL_ANGLES, wallAngle)}
        </select>
      </label>
    </div>
  </div>`;
}

function defaultRow(hasDifficulty, defaultDifficulty) {
  const first = LIMB_SIDE_OPTIONS[0];
  const row = { limb: first.limb, side: first.side, holdType: HOLD_TYPES_BY_LIMB[first.limb][0], movementStyle: MOVEMENT_STYLES_BY_LIMB[first.limb][0], wallAngle: VALID_WALL_ANGLES[0] };
  if (hasDifficulty) row.difficulty = defaultDifficulty;
  return row;
}

export function createMoveRowList({ listEl, addBtnEl, hasDifficulty, defaultDifficulty }) {
  let rows = [];

  function render() {
    listEl.innerHTML = rows.map(rowHtml).join("");
  }

  function rowIndexOf(el) {
    return Array.from(listEl.children).indexOf(el.closest("[data-move-row]"));
  }

  listEl.addEventListener("click", e => {
    const removeBtn = e.target.closest("[data-remove-row]");
    if (!removeBtn) return;
    const index = rowIndexOf(removeBtn);
    rows.splice(index, 1);
    render();
  });

  listEl.addEventListener("change", e => {
    const select = e.target.closest("select[data-field]");
    if (!select) return;
    const index = rowIndexOf(select);
    const row = rows[index];
    const field = select.dataset.field;

    if (field === "limbSide") {
      const { limb, side } = limbSideOption(select.value);
      row.limb = limb;
      row.side = side;
      row.holdType = HOLD_TYPES_BY_LIMB[limb][0];
      row.movementStyle = MOVEMENT_STYLES_BY_LIMB[limb][0];
      render(); // re-render this row so its holdType/movementStyle <select>s reflect the new limb's filtered options
    } else {
      row[field] = select.value;
    }
  });

  addBtnEl.addEventListener("click", () => {
    rows.push(defaultRow(hasDifficulty, defaultDifficulty));
    render();
  });

  return {
    getRows: () => rows.map(r => ({ ...r })),
    setRows: newRows => { rows = newRows.map(r => ({ ...r })); render(); },
    reset: () => { rows = []; render(); },
  };
}
```

- [ ] **Step 4: Run the tests, confirm they pass**

Run: `pnpm exec vitest run test/client/move-tagging.test.js`
Expected: PASS (8 tests)

- [ ] **Step 5: Confirm `happy-dom` is available and `vitest.config.js` doesn't need a per-file environment override**

Run: `grep -n happy-dom package.json`
Expected: a `devDependencies` entry already present. If absent, this step's `# vitest-environment happy-dom` magic comment (Step 1) will fail to resolve — in that case, run `pnpm add -D happy-dom` and re-run Step 4's test command; do not add a global `environment: "happy-dom"` to `vitest.config.js`, since that would flip every other `test/**/*.test.js` file (all Workers-pool-based) onto the wrong environment — the per-file magic comment is the correct scoping.

- [ ] **Step 6: Add the Move difficulty and Pain/injury markup to `public/log/index.html`**

Insert after the Attempts block added in Task 4 Step 1, before the Notes label:

```html
      <div class="mt-[1.1rem]">
        <div class="text-[.72rem] font-semibold uppercase tracking-[.07em] text-muted mb-2">Move difficulty</div>
        <div class="text-[.8rem] font-semibold text-foreground mb-1">Hardest moves for you</div>
        <div id="hardest-moves-list"></div>
        <button type="button" class="text-[.85rem] font-semibold text-accent bg-transparent border-0 cursor-pointer p-0 mb-2" id="hardest-moves-add">+ Add a move</button>

        <div class="text-[.8rem] font-semibold text-foreground mb-1 mt-2">Easiest moves for you</div>
        <div id="easiest-moves-list"></div>
        <button type="button" class="text-[.85rem] font-semibold text-accent bg-transparent border-0 cursor-pointer p-0" id="easiest-moves-add">+ Add a move</button>
      </div>

      <div class="mt-[1.1rem]">
        <div class="text-[.72rem] font-semibold uppercase tracking-[.07em] text-muted mb-2">Pain/injury during this climb</div>
        <div id="pain-moves-list"></div>
        <button type="button" class="text-[.85rem] font-semibold text-accent bg-transparent border-0 cursor-pointer p-0" id="pain-moves-add">+ Add a move</button>
      </div>
```

- [ ] **Step 7: Wire the three widget instances into `client/entry-form.js`**

Add the import (alongside the other imports at the top of the file):

```js
import { createMoveRowList } from "./move-tagging.js";
```

Instantiate the three widgets, after `placePicker` is created (after line 55):

```js
  const hardestMoves = createMoveRowList({ listEl: document.getElementById("hardest-moves-list"), addBtnEl: document.getElementById("hardest-moves-add"), hasDifficulty: true, defaultDifficulty: "hardest" });
  const easiestMoves = createMoveRowList({ listEl: document.getElementById("easiest-moves-list"), addBtnEl: document.getElementById("easiest-moves-add"), hasDifficulty: true, defaultDifficulty: "easiest" });
  const painMoves = createMoveRowList({ listEl: document.getElementById("pain-moves-list"), addBtnEl: document.getElementById("pain-moves-add"), hasDifficulty: false });
```

Pre-populate on open, after the Attempts pre-population added in Task 4 Step 3:

```js
    attemptsValue = entry?.attemptsToSend ?? 0;
    renderAttempts();
    hardestMoves.setRows((entry?.moves ?? []).filter(m => m.difficulty === "hardest"));
    easiestMoves.setRows((entry?.moves ?? []).filter(m => m.difficulty === "easiest"));
    painMoves.setRows(entry?.painMoves ?? []);
```

Add two more lines to the submitted entry object, directly after the `attemptsToSend: attemptsValue,` line Task 4 Step 4 already added (do not duplicate that line — only these two are new):

```js
      moves: [...hardestMoves.getRows(), ...easiestMoves.getRows()],
      painMoves: painMoves.getRows(),
```

- [ ] **Step 8: Manual verification**

Run: `pnpm dev`, open Add Entry, add two Hardest moves and one Easiest move, add one Pain/injury row, save.
Expected: entry saves successfully; reopening it for edit shows the same rows split correctly back into Hardest/Easiest/Pain lists. Changing a row's Limb dropdown re-filters that row's Hold type and Movement options (e.g. selecting "Right Foot" removes "lockoff" from Movement and switches Hold type to toe-hook/heel-hook only).

- [ ] **Step 9: Commit**

```bash
git add client/move-tagging.js test/client/move-tagging.test.js client/entry-form.js public/log/index.html
git commit -m "Add Move difficulty and Pain/injury sections to the entry form"
```

---

## Task 6: End-to-end coverage

**Files:**
- Modify: `e2e/log-page.spec.js` (confirmed via `grep -rln "entry-overlay\|add-btn" e2e/*.spec.js` — this is the file with entry-modal coverage; `e2e/profile-page.spec.js`/`e2e/account-page.spec.js` also match that grep but only because they share the same header/tab-bar chrome fixture, not because they open the entry modal themselves)
- Test: itself (e2e specs are the tests)

**Interfaces:**
- Consumes: the full Task 1–5 stack, end-to-end, through the real UI and a mocked `/logbook/api/*`.

- [ ] **Step 1: Read `e2e/log-page.spec.js`'s existing entry-modal test(s) to match its established pattern**

Run: `grep -n "add-btn\|entry-overlay\|entry-submit-btn\|mockApi\|page.route" e2e/log-page.spec.js`
Read the surrounding test(s) this turns up in full before writing Step 2's new tests — confirm the exact existing pattern for (a) opening the Add Entry modal, (b) filling the required fields (name/place/grade) before a submit will validate, and (c) whether entry saves are asserted via `page.route()` intercepting the POST/PUT request body or via `mockApi()`'s own fixture data — reuse whichever this file already does verbatim, do not introduce a second mocking style into the same file.

- [ ] **Step 2: Write the failing e2e tests**

Add to the file identified in Step 1 (exact test code depends on that file's established helpers — the shape below is the required coverage, adapt syntax to match this file's own existing `mockApi()`/`page.route()` conventions once confirmed in Step 1):

```js
test("Exertion is visible for Send/Flash and hidden for Project/Check out/Archived", async ({ page }) => {
  // ...existing setup to open the Add Entry modal...
  await expect(page.locator("#exertion-field")).toBeVisible(); // Send is checked by default
  await page.locator('#status-group input[value="project"]').check({ force: true });
  await expect(page.locator("#exertion-field")).toBeHidden();
  await page.locator('#status-group input[value="flash"]').check({ force: true });
  await expect(page.locator("#exertion-field")).toBeVisible();
});

test("Attempts stepper increments/decrements and cannot go below 0", async ({ page }) => {
  // ...existing setup to open the Add Entry modal...
  await expect(page.locator("#attempts-count")).toHaveText("0");
  await expect(page.locator("#attempts-minus")).toBeDisabled();
  await page.locator("#attempts-plus").click();
  await page.locator("#attempts-plus").click();
  await expect(page.locator("#attempts-count")).toHaveText("2");
  await page.locator("#attempts-minus").click();
  await expect(page.locator("#attempts-count")).toHaveText("1");
});

test("adding a move and saving submits it in the entry payload", async ({ page }) => {
  let submittedBody;
  await page.route("**/logbook/api/admin/logbook", async route => {
    submittedBody = route.request().postDataJSON();
    await route.fulfill({ status: 201, json: { entries: [{ ...submittedBody, id: "new-id" }] } });
  });
  // ...existing setup to open the Add Entry modal, fill required fields (name, place, grade)...
  await page.locator("#hardest-moves-add").click();
  await page.locator('#hardest-moves-list [data-field="limbSide"]').selectOption("foot-right");
  await page.locator("#entry-submit-btn").click();

  expect(submittedBody.moves).toHaveLength(1);
  expect(submittedBody.moves[0]).toMatchObject({ difficulty: "hardest", limb: "foot", side: "right" });
});

test("editing an entry pre-populates its existing moves into the right list", async ({ page }) => {
  // ...existing setup, mocked with an entry that already has one hardest move and one pain move...
  // ...open that entry for edit (existing edit-open pattern)...
  await expect(page.locator("#hardest-moves-list [data-move-row]")).toHaveCount(1);
  await expect(page.locator("#pain-moves-list [data-move-row]")).toHaveCount(1);
});
```

- [ ] **Step 3: Run the tests, confirm they fail**

Run: `pnpm exec playwright test <the file identified in Step 1> -g "Exertion|Attempts|move"`
Expected: FAIL — either elements aren't found (before Task 4/5's markup exists — but by this point in the plan they do, so failures here should only reflect real bugs/mocking mismatches, not missing markup) or the mocked assertions don't match. If failures are about mocking/setup shape rather than the feature itself, adjust the test's setup to match this file's established fixture conventions (per Step 1) rather than the feature code.

- [ ] **Step 4: Fix any real issues found, re-run until green**

Run: `pnpm exec playwright test <file> -g "Exertion|Attempts|move"`
Expected: PASS. If a real bug in Tasks 4/5's implementation is found here (not just a test-setup mismatch), fix it in the relevant task's own file and note the fix in this task's commit message.

- [ ] **Step 5: Run the full e2e suite twice (idempotency check, this repo's own standard)**

Run: `pnpm exec playwright test` (twice)
Expected: PASS both times, no flakiness.

- [ ] **Step 6: Run the full unit suite one final time**

Run: `pnpm test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add e2e/
git commit -m "Add e2e coverage for the entry form's Exertion/Attempts/move-tagging sections"
```

---

## Final Verification

- [ ] `pnpm test` — full pass
- [ ] `pnpm exec playwright test` — full pass, twice
- [ ] Manual: `pnpm dev`, add a new Send entry with Exertion 80%, 3 attempts, one hardest move (Left Hand crimp static overhang), one pain row (Right Foot toe-hook dynamic slab); reload the page; edit that same entry; confirm every value round-tripped correctly, including the split between Hardest/Easiest lists.
- [ ] Confirm `git log --oneline` shows 6 commits (one per task above), each independently reviewable.
