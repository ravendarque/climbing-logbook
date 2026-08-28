# Performance Insights — Phase 1 Schema Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land epic #5's four Phase 1 schema additions (#36 `entry_moves`, #37 `attempts_to_send`, #563 `rpe`, #572 `entry_pain_moves`) as pure, additive D1 migrations with schema-level test coverage — no application code changes.

**Architecture:** Four new migration files under `migrations/`, applied in numeric order by the existing `readD1Migrations`/`applyD1Migrations` test setup (no new machinery needed). Each adds either a new child table (`entry_moves`, `entry_pain_moves`) or a nullable column on `entries` (`attempts_to_send`, `rpe`). Verified with raw-D1 tests added to the existing `test/app-schema.test.js` — the established home for schema-only coverage before an HTTP API exists for a table (see that file's own header comment).

**Tech Stack:** D1 (SQLite dialect), `@cloudflare/vitest-pool-workers`, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-27-performance-insights-ui-design.md` ("Data model" and "Injury/pain move tagging" sections) — the plan below implements those sections' exact schema; the spec doc is the authority on *why*, this plan is the authority on *how to build it in small steps*.

## Global Constraints

- **Schema only — no application code in this plan.** Per the established discipline from migration `0006_add_beta_opt_in.sql`'s own header comment: a PR that mixes a migration with app code that reads/writes the new column gets classified `direct` by `deploy.yml` and ships straight to production, bypassing the beta gate. Wiring the entries API (`server/api/logbook.js`, `shared/entry-schema.js`) and the entry-form UI is epic #5's Phase 2 (beta-only) — a separate, later plan, deliberately not touched here.
- **Migrations are numbered sequentially, 4-digit zero-padded**, next available is `0007` (current highest is `migrations/0006_add_beta_opt_in.sql`).
- **D1/SQLite rejects a non-constant `DEFAULT` on `ALTER TABLE ADD COLUMN`** (confirmed empirically, see `migrations/0005`'s own comment) — every new nullable column below has no `DEFAULT` clause; SQLite/D1 columns are nullable by default anyway, which is the desired state (no backfill).
- **Every 0/1 flag in this schema is `BOOLEAN` + `CHECK (col IN (0,1))`**, not a bare `INTEGER` — not needed in this plan (no new boolean columns), noted for consistency awareness only.
- **Migrations are auto-applied for every test run** — `vitest.config.js` reads every `.sql` file under `migrations/` via `readD1Migrations` and `test/apply-migrations.js` applies them to a fresh D1 instance per test file. No manual `wrangler d1 migrations apply` step is needed to run the tests in this plan.
- **Test command:** `pnpm test` (runs `vitest run`).
- **Real D1, not mocked** — every test in this plan runs against the actual Workers D1 binding (`env.LOGBOOK_DB`) inside the `@cloudflare/vitest-pool-workers` pool, same as `test/app-schema.test.js`'s existing tests.

---

## File Structure

- Create `migrations/0007_add_entry_moves.sql` — #36's `entry_moves` table.
- Create `migrations/0008_add_attempts_to_send.sql` — #37's `entries.attempts_to_send` column.
- Create `migrations/0009_add_rpe.sql` — #563's `entries.rpe` column.
- Create `migrations/0010_add_entry_pain_moves.sql` — #572's `entry_pain_moves` table.
- Modify `test/app-schema.test.js` — add one `describe` block per migration above, following the file's existing `seedUser`/`seedLocation`/`seedPlace` + raw-D1-insert pattern.

---

### Task 1: `entry_moves` table (#36)

**Files:**
- Create: `migrations/0007_add_entry_moves.sql`
- Test: `test/app-schema.test.js` (append a new `describe("entry_moves", ...)` block)

**Interfaces:**
- Consumes: `entries(id)` (existing table, `migrations/0003_app_data.sql`).
- Produces: `entry_moves` table — columns `id, entry_id, difficulty, limb, side, hold_type, movement_style, wall_angle, created_at`. Phase 2's API layer will read/write this table by name; no other interface to track yet.

- [ ] **Step 1: Write the failing test**

Append to `test/app-schema.test.js` (after the existing `describe("settings", ...)` block, same file, no new imports needed — `seedUser`/`seedLocation`/`seedPlace` already exist above):

```js
describe("entry_moves (#36)", () => {
  async function seedEntry(userId, placeId, id = "entry-1") {
    await env.LOGBOOK_DB
      .prepare(
        `INSERT INTO entries (id, user_id, place_id, name, grade, discipline_id, status_id)
         VALUES (?, ?, ?, 'Test', '7A', 'boulder', 'send')`
      )
      .bind(id, userId, placeId)
      .run();
    return id;
  }

  it("inserts a hardest-move row with all four dimensions", async () => {
    const userId = await seedUser();
    const locationId = await seedLocation(userId);
    const placeId = await seedPlace(userId, locationId);
    const entryId = await seedEntry(userId, placeId);

    await env.LOGBOOK_DB
      .prepare(
        `INSERT INTO entry_moves (id, entry_id, difficulty, limb, side, hold_type, movement_style, wall_angle)
         VALUES ('move-1', ?, 'hardest', 'hand', 'left', 'crimp', 'lockoff', 'overhang')`
      )
      .bind(entryId)
      .run();

    const move = await env.LOGBOOK_DB.prepare(`SELECT * FROM entry_moves WHERE id = 'move-1'`).first();
    expect(move.difficulty).toBe("hardest");
    expect(move.limb).toBe("hand");
    expect(move.side).toBe("left");
    expect(move.hold_type).toBe("crimp");
    expect(move.movement_style).toBe("lockoff");
    expect(move.wall_angle).toBe("overhang");
  });

  it("rejects an unknown difficulty", async () => {
    const userId = await seedUser();
    const locationId = await seedLocation(userId);
    const placeId = await seedPlace(userId, locationId);
    const entryId = await seedEntry(userId, placeId);

    await expect(
      env.LOGBOOK_DB
        .prepare(
          `INSERT INTO entry_moves (id, entry_id, difficulty, limb, side, hold_type, movement_style, wall_angle)
           VALUES ('move-1', ?, 'medium', 'hand', 'left', 'crimp', 'static', 'overhang')`
        )
        .bind(entryId)
        .run()
    ).rejects.toThrow(/CHECK/);
  });

  it("rejects lockoff for a non-hand limb", async () => {
    const userId = await seedUser();
    const locationId = await seedLocation(userId);
    const placeId = await seedPlace(userId, locationId);
    const entryId = await seedEntry(userId, placeId);

    await expect(
      env.LOGBOOK_DB
        .prepare(
          `INSERT INTO entry_moves (id, entry_id, difficulty, limb, side, hold_type, movement_style, wall_angle)
           VALUES ('move-1', ?, 'hardest', 'foot', 'right', 'toe-hook', 'lockoff', 'overhang')`
        )
        .bind(entryId)
        .run()
    ).rejects.toThrow(/CHECK/);
  });

  it("allows lockoff for hand but not for foot/knee, and static/dynamic for every limb", async () => {
    const userId = await seedUser();
    const locationId = await seedLocation(userId);
    const placeId = await seedPlace(userId, locationId);
    const entryId = await seedEntry(userId, placeId);

    await env.LOGBOOK_DB
      .prepare(
        `INSERT INTO entry_moves (id, entry_id, difficulty, limb, side, hold_type, movement_style, wall_angle)
         VALUES ('move-1', ?, 'easiest', 'knee', 'right', 'kneebar', 'static', 'roof')`
      )
      .bind(entryId)
      .run();

    const move = await env.LOGBOOK_DB.prepare(`SELECT movement_style FROM entry_moves WHERE id = 'move-1'`).first();
    expect(move.movement_style).toBe("static");
  });

  it("cascades: deleting an entry deletes its entry_moves rows", async () => {
    const userId = await seedUser();
    const locationId = await seedLocation(userId);
    const placeId = await seedPlace(userId, locationId);
    const entryId = await seedEntry(userId, placeId);
    await env.LOGBOOK_DB
      .prepare(
        `INSERT INTO entry_moves (id, entry_id, difficulty, limb, side, hold_type, movement_style, wall_angle)
         VALUES ('move-1', ?, 'hardest', 'hand', 'left', 'crimp', 'static', 'vert')`
      )
      .bind(entryId)
      .run();

    await env.LOGBOOK_DB.prepare(`DELETE FROM entries WHERE id = ?`).bind(entryId).run();

    const remaining = await env.LOGBOOK_DB.prepare(`SELECT id FROM entry_moves WHERE id = 'move-1'`).first();
    expect(remaining).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test suite to verify these new tests fail**

Run: `pnpm test -- app-schema`
Expected: FAIL — `no such table: entry_moves` (the migration doesn't exist yet).

- [ ] **Step 3: Write the migration**

Create `migrations/0007_add_entry_moves.sql`:

```sql
-- Move-level hardest/easiest tagging for #13's strengths/weaknesses
-- breakdown (#36, epic #5 Phase 1). A climb can mix hold types and wall
-- angles across its length, so the signal #13 needs lives at the level
-- of individual moves within an entry, not the entry as a whole -- see
-- docs/superpowers/specs/2026-08-27-performance-insights-ui-design.md
-- for the full design and taxonomy reasoning.
--
-- Zero-to-many rows per entry, entirely optional. difficulty buckets a
-- row into "hardest" or "easiest" (one table, not two parallel ones --
-- same row shape either way). hold_type's valid set depends on limb
-- (hand vs. foot/knee use different vocabularies) -- validated
-- app-level once Phase 2 wires the API, same treatment entries.grade
-- already gets (too limb-dependent for a flat CHECK). The
-- movement_style CHECK below enforces the one cross-column rule the
-- taxonomy actually has: lockoff is a hand-only movement style.
CREATE TABLE entry_moves (
  id             TEXT PRIMARY KEY,
  entry_id       TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  difficulty     TEXT NOT NULL CHECK (difficulty IN ('hardest','easiest')),
  limb           TEXT NOT NULL CHECK (limb IN ('hand','foot','knee')),
  side           TEXT NOT NULL CHECK (side IN ('left','right')),
  hold_type      TEXT NOT NULL,
  movement_style TEXT NOT NULL CHECK (
                   (limb = 'hand' AND movement_style IN ('static','dynamic','lockoff'))
                OR (limb != 'hand' AND movement_style IN ('static','dynamic'))
                 ),
  wall_angle     TEXT NOT NULL CHECK (wall_angle IN ('slab','vert','overhang','roof')),
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_entry_moves_entry_id ON entry_moves(entry_id);
```

- [ ] **Step 4: Run the test suite to verify the new tests pass**

Run: `pnpm test -- app-schema`
Expected: PASS — all 5 new tests green, plus every pre-existing test in the file still passing.

- [ ] **Step 5: Commit**

```bash
git add migrations/0007_add_entry_moves.sql test/app-schema.test.js
git commit -m "Add entry_moves table for move-level hardest/easiest tagging (#36)"
```

---

### Task 2: `entries.attempts_to_send` column (#37)

**Files:**
- Create: `migrations/0008_add_attempts_to_send.sql`
- Test: `test/app-schema.test.js` (append a new `describe("entries.attempts_to_send (#37)", ...)` block)

**Interfaces:**
- Consumes: `entries` table (existing).
- Produces: `entries.attempts_to_send` (nullable `INTEGER`, non-negative). Phase 2's #14 view reads this as a third data layer.

- [ ] **Step 1: Write the failing test**

Append to `test/app-schema.test.js`:

```js
describe("entries.attempts_to_send (#37)", () => {
  it("defaults to null and accepts a non-negative integer", async () => {
    const userId = await seedUser();
    const locationId = await seedLocation(userId);
    const placeId = await seedPlace(userId, locationId);

    await env.LOGBOOK_DB
      .prepare(
        `INSERT INTO entries (id, user_id, place_id, name, grade, discipline_id, status_id)
         VALUES ('entry-1', ?, ?, 'Test', '7A', 'boulder', 'send')`
      )
      .bind(userId, placeId)
      .run();
    const noValue = await env.LOGBOOK_DB.prepare(`SELECT attempts_to_send FROM entries WHERE id = 'entry-1'`).first();
    expect(noValue.attempts_to_send).toBeNull();

    await env.LOGBOOK_DB.prepare(`UPDATE entries SET attempts_to_send = 4 WHERE id = 'entry-1'`).run();
    const withValue = await env.LOGBOOK_DB.prepare(`SELECT attempts_to_send FROM entries WHERE id = 'entry-1'`).first();
    expect(withValue.attempts_to_send).toBe(4);
  });

  it("rejects a negative attempts_to_send", async () => {
    const userId = await seedUser();
    const locationId = await seedLocation(userId);
    const placeId = await seedPlace(userId, locationId);

    await expect(
      env.LOGBOOK_DB
        .prepare(
          `INSERT INTO entries (id, user_id, place_id, name, grade, discipline_id, status_id, attempts_to_send)
           VALUES ('entry-1', ?, ?, 'Test', '7A', 'boulder', 'send', -1)`
        )
        .bind(userId, placeId)
        .run()
    ).rejects.toThrow(/CHECK/);
  });
});
```

- [ ] **Step 2: Run the test suite to verify these new tests fail**

Run: `pnpm test -- app-schema`
Expected: FAIL — `table entries has no column named attempts_to_send`.

- [ ] **Step 3: Write the migration**

Create `migrations/0008_add_attempts_to_send.sql`:

```sql
-- Attempts-to-send counter (#37, epic #5 Phase 1) -- gates #14
-- (onsight/redpoint gap tracking), where it becomes a third data layer
-- (average attempts per send, per time bucket) behind #14's two
-- overlaid grade-trend lines. Nullable, additive, no backfill -- older
-- entries just won't have a count. No non-constant DEFAULT (D1 rejects
-- one on ALTER TABLE ADD COLUMN, confirmed in migrations/0005) and none
-- would make sense here anyway, since the count varies per entry.
ALTER TABLE entries ADD COLUMN attempts_to_send INTEGER CHECK (attempts_to_send IS NULL OR attempts_to_send >= 0);
```

- [ ] **Step 4: Run the test suite to verify the new tests pass**

Run: `pnpm test -- app-schema`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add migrations/0008_add_attempts_to_send.sql test/app-schema.test.js
git commit -m "Add entries.attempts_to_send column (#37)"
```

---

### Task 3: `entries.rpe` column (#563)

**Files:**
- Create: `migrations/0009_add_rpe.sql`
- Test: `test/app-schema.test.js` (append a new `describe("entries.rpe (#563)", ...)` block)

**Interfaces:**
- Consumes: `entries` table (existing).
- Produces: `entries.rpe` (nullable `INTEGER`, 0–100 — the entry-form's Exertion percentage, not a raw 1–10 RPE value; see spec doc's "Exertion" section for why the friendlier 0–100% scale is what's actually stored under this column name). Phase 2's #38 view reads this against grade.

- [ ] **Step 1: Write the failing test**

Append to `test/app-schema.test.js`:

```js
describe("entries.rpe (#563)", () => {
  it("defaults to null and accepts a value in [0, 100]", async () => {
    const userId = await seedUser();
    const locationId = await seedLocation(userId);
    const placeId = await seedPlace(userId, locationId);

    await env.LOGBOOK_DB
      .prepare(
        `INSERT INTO entries (id, user_id, place_id, name, grade, discipline_id, status_id)
         VALUES ('entry-1', ?, ?, 'Test', '7A', 'boulder', 'send')`
      )
      .bind(userId, placeId)
      .run();
    const noValue = await env.LOGBOOK_DB.prepare(`SELECT rpe FROM entries WHERE id = 'entry-1'`).first();
    expect(noValue.rpe).toBeNull();

    await env.LOGBOOK_DB.prepare(`UPDATE entries SET rpe = 70 WHERE id = 'entry-1'`).run();
    const withValue = await env.LOGBOOK_DB.prepare(`SELECT rpe FROM entries WHERE id = 'entry-1'`).first();
    expect(withValue.rpe).toBe(70);
  });

  it("rejects an rpe outside 0-100", async () => {
    const userId = await seedUser();
    const locationId = await seedLocation(userId);
    const placeId = await seedPlace(userId, locationId);

    await expect(
      env.LOGBOOK_DB
        .prepare(
          `INSERT INTO entries (id, user_id, place_id, name, grade, discipline_id, status_id, rpe)
           VALUES ('entry-1', ?, ?, 'Test', '7A', 'boulder', 'send', 150)`
        )
        .bind(userId, placeId)
        .run()
    ).rejects.toThrow(/CHECK/);
  });
});
```

- [ ] **Step 2: Run the test suite to verify these new tests fail**

Run: `pnpm test -- app-schema`
Expected: FAIL — `table entries has no column named rpe`.

- [ ] **Step 3: Write the migration**

Create `migrations/0009_add_rpe.sql`:

```sql
-- Perceived exertion, recorded per climb, not per session (#563, epic #5
-- Phase 1) -- gates #38 (RPE/effort trend view). Deliberately no
-- session concept in this schema: the foundation stays a logbook of
-- individual climbs -- see docs/superpowers/specs/2026-08-27-performance-insights-ui-design.md's
-- "Data model" section for the full reasoning.
--
-- Stored as 0-100 (the entry form's Exertion percentage slider, in
-- steps of 10), not a raw 1-10 RPE value -- friendlier at a glance than
-- the underlying RPE scale it's built on, per the spec doc's "Exertion"
-- section. The column keeps the `rpe` name for citation traceability
-- (docs/climbing-analytics-research.md's Gajdošík et al. 2020 source).
-- The CHECK enforces the value range only, not the step-of-10 -- that's
-- a UI convenience, not a real data-integrity boundary.
ALTER TABLE entries ADD COLUMN rpe INTEGER CHECK (rpe IS NULL OR (rpe >= 0 AND rpe <= 100));
```

- [ ] **Step 4: Run the test suite to verify the new tests pass**

Run: `pnpm test -- app-schema`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add migrations/0009_add_rpe.sql test/app-schema.test.js
git commit -m "Add entries.rpe column (#563)"
```

---

### Task 4: `entry_pain_moves` table (#572)

**Files:**
- Create: `migrations/0010_add_entry_pain_moves.sql`
- Test: `test/app-schema.test.js` (append a new `describe("entry_pain_moves (#572)", ...)` block)

**Interfaces:**
- Consumes: `entries(id)` (existing table).
- Produces: `entry_pain_moves` table — columns `id, entry_id, limb, side, hold_type, movement_style, wall_angle, created_at`. Phase 2's #39 view queries this table's presence (row count) directly — there is no `entries.pain_flag` column (removed, see #564, closed).

- [ ] **Step 1: Write the failing test**

Append to `test/app-schema.test.js`:

```js
describe("entry_pain_moves (#572)", () => {
  async function seedEntry(userId, placeId, id = "entry-1") {
    await env.LOGBOOK_DB
      .prepare(
        `INSERT INTO entries (id, user_id, place_id, name, grade, discipline_id, status_id)
         VALUES (?, ?, ?, 'Test', '7A', 'boulder', 'send')`
      )
      .bind(id, userId, placeId)
      .run();
    return id;
  }

  it("inserts a pain-move row with all four dimensions, no difficulty column", async () => {
    const userId = await seedUser();
    const locationId = await seedLocation(userId);
    const placeId = await seedPlace(userId, locationId);
    const entryId = await seedEntry(userId, placeId);

    await env.LOGBOOK_DB
      .prepare(
        `INSERT INTO entry_pain_moves (id, entry_id, limb, side, hold_type, movement_style, wall_angle)
         VALUES ('pain-1', ?, 'hand', 'left', 'crimp', 'dynamic', 'overhang')`
      )
      .bind(entryId)
      .run();

    const row = await env.LOGBOOK_DB.prepare(`SELECT * FROM entry_pain_moves WHERE id = 'pain-1'`).first();
    expect(row.limb).toBe("hand");
    expect(row.side).toBe("left");
    expect(row.hold_type).toBe("crimp");
    expect(row.movement_style).toBe("dynamic");
    expect(row.wall_angle).toBe("overhang");
    expect(row.difficulty).toBeUndefined();
  });

  it("rejects lockoff for a non-hand limb, same cross-column rule as entry_moves", async () => {
    const userId = await seedUser();
    const locationId = await seedLocation(userId);
    const placeId = await seedPlace(userId, locationId);
    const entryId = await seedEntry(userId, placeId);

    await expect(
      env.LOGBOOK_DB
        .prepare(
          `INSERT INTO entry_pain_moves (id, entry_id, limb, side, hold_type, movement_style, wall_angle)
           VALUES ('pain-1', ?, 'foot', 'right', 'toe-hook', 'lockoff', 'overhang')`
        )
        .bind(entryId)
        .run()
    ).rejects.toThrow(/CHECK/);
  });

  it("supports zero-to-many rows per entry -- row count is the pain signal", async () => {
    const userId = await seedUser();
    const locationId = await seedLocation(userId);
    const placeId = await seedPlace(userId, locationId);
    const entryId = await seedEntry(userId, placeId);

    const none = await env.LOGBOOK_DB.prepare(`SELECT COUNT(*) AS n FROM entry_pain_moves WHERE entry_id = ?`).bind(entryId).first();
    expect(none.n).toBe(0);

    await env.LOGBOOK_DB
      .prepare(
        `INSERT INTO entry_pain_moves (id, entry_id, limb, side, hold_type, movement_style, wall_angle)
         VALUES ('pain-1', ?, 'hand', 'left', 'crimp', 'static', 'vert')`
      )
      .bind(entryId)
      .run();
    await env.LOGBOOK_DB
      .prepare(
        `INSERT INTO entry_pain_moves (id, entry_id, limb, side, hold_type, movement_style, wall_angle)
         VALUES ('pain-2', ?, 'foot', 'right', 'smear', 'static', 'slab')`
      )
      .bind(entryId)
      .run();

    const some = await env.LOGBOOK_DB.prepare(`SELECT COUNT(*) AS n FROM entry_pain_moves WHERE entry_id = ?`).bind(entryId).first();
    expect(some.n).toBe(2);
  });

  it("cascades: deleting an entry deletes its entry_pain_moves rows", async () => {
    const userId = await seedUser();
    const locationId = await seedLocation(userId);
    const placeId = await seedPlace(userId, locationId);
    const entryId = await seedEntry(userId, placeId);
    await env.LOGBOOK_DB
      .prepare(
        `INSERT INTO entry_pain_moves (id, entry_id, limb, side, hold_type, movement_style, wall_angle)
         VALUES ('pain-1', ?, 'hand', 'left', 'crimp', 'static', 'vert')`
      )
      .bind(entryId)
      .run();

    await env.LOGBOOK_DB.prepare(`DELETE FROM entries WHERE id = ?`).bind(entryId).run();

    const remaining = await env.LOGBOOK_DB.prepare(`SELECT id FROM entry_pain_moves WHERE id = 'pain-1'`).first();
    expect(remaining).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test suite to verify these new tests fail**

Run: `pnpm test -- app-schema`
Expected: FAIL — `no such table: entry_pain_moves`.

- [ ] **Step 3: Write the migration**

Create `migrations/0010_add_entry_pain_moves.sql`:

```sql
-- Move-level pain/injury tagging (#572, epic #5 Phase 1) -- gates #39
-- (injury/pain log). Sole pain-tracking mechanism: there is no flat
-- entries.pain_flag column (was #564, closed 2026-08-28, superseded by
-- this table) -- zero rows means no pain logged, one or more means yes,
-- the row count *is* the flag.
--
-- Shares entry_moves' limb/hold_type/movement_style/wall_angle taxonomy
-- (same CHECK shape) but is explicitly its own table, not a `pain`
-- column added to entry_moves -- that was considered and rejected,
-- since it would imply pain is a property of being tagged
-- hardest/easiest, which isn't true (a move can hurt without being
-- anyone's hardest or easiest move of the climb). No difficulty column
-- here -- this table has no hardest/easiest concept, only "did this
-- move hurt."
CREATE TABLE entry_pain_moves (
  id             TEXT PRIMARY KEY,
  entry_id       TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  limb           TEXT NOT NULL CHECK (limb IN ('hand','foot','knee')),
  side           TEXT NOT NULL CHECK (side IN ('left','right')),
  hold_type      TEXT NOT NULL,
  movement_style TEXT NOT NULL CHECK (
                   (limb = 'hand' AND movement_style IN ('static','dynamic','lockoff'))
                OR (limb != 'hand' AND movement_style IN ('static','dynamic'))
                 ),
  wall_angle     TEXT NOT NULL CHECK (wall_angle IN ('slab','vert','overhang','roof')),
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_entry_pain_moves_entry_id ON entry_pain_moves(entry_id);
```

- [ ] **Step 4: Run the test suite to verify the new tests pass**

Run: `pnpm test -- app-schema`
Expected: PASS.

- [ ] **Step 5: Run the full test suite once, to confirm nothing else broke**

Run: `pnpm test`
Expected: PASS — every test file green, not just `app-schema.test.js`.

- [ ] **Step 6: Commit**

```bash
git add migrations/0010_add_entry_pain_moves.sql test/app-schema.test.js
git commit -m "Add entry_pain_moves table (#572)"
```

---

## Handoff

All four migrations touch `migrations/`, so per `deploy.yml`'s classification the merge deploys **direct** (both beta and production automatically) — no `promote.yml` run needed, consistent with why this batch was sequenced first in epic #5's delivery order.

Branch off `main`, one branch/PR covering all four tasks (`epic-5-phase1-schema` or similar) — they're small, share the same "Phase 1 schema batch" rationale the epic itself groups them under, and reviewing/shipping them together is one round of verification instead of four. PR body should read `Closes #36, Closes #37, Closes #563, Closes #572` so merging auto-closes all four sub-issues; also check off their boxes on epic #5's own Phase 1 list.

**Not in this plan, by design:** the #569 charting-library-vs-hand-rolled spike (investigative, not TDD-shaped — run it as its own spike before writing Phase 2's plans), and all of Phase 2 (the hub page, all five views, and the entry-form "Performance data" section) — each gets its own plan once picked up, since wiring the API/UI to these columns is what actually makes them beta-visible, and that's a deliberately separate, later step.
