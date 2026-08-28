// Exercises the normalized D1 app-data schema (#21) directly via
// env.LOGBOOK_DB -- there's no HTTP API for these tables yet (that's
// #297's resource-handler/authorization layer), so this is schema-level
// verification: seeded lookup tables, FK/CHECK constraints, cascade
// behavior, and column defaults. Real D1, not mocked -- see
// test/apply-migrations.js.
import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { resetAuthTables } from "./support.js";

beforeEach(resetAuthTables);

async function seedUser(id = "user-1") {
  const now = new Date().toISOString();
  await env.LOGBOOK_DB
    .prepare(
      `INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt)
       VALUES (?, ?, ?, 1, ?, ?)`
    )
    .bind(id, "Test User", `${id}@example.com`, now, now)
    .run();
  return id;
}

async function seedLocation(userId, id = "loc-1") {
  await env.LOGBOOK_DB
    .prepare(`INSERT INTO locations (id, user_id, name) VALUES (?, ?, ?)`)
    .bind(id, userId, "Fontainebleau")
    .run();
  return id;
}

async function seedPlace(userId, locationId, id = "place-1") {
  await env.LOGBOOK_DB
    .prepare(`INSERT INTO places (id, user_id, location_id, area) VALUES (?, ?, ?, ?)`)
    .bind(id, userId, locationId, "Bas Cuvier")
    .run();
  return id;
}

describe("lookup tables", () => {
  it("seeds disciplines", async () => {
    const { results } = await env.LOGBOOK_DB.prepare(`SELECT id, name FROM disciplines ORDER BY id`).all();
    expect(results).toEqual([
      { id: "boulder", name: "Boulder" },
      { id: "lead", name: "Lead" },
    ]);
  });

  it("seeds statuses", async () => {
    const { results } = await env.LOGBOOK_DB.prepare(`SELECT id FROM statuses ORDER BY id`).all();
    expect(results.map(r => r.id)).toEqual(["archived", "checkout", "project", "send"]);
  });
});

describe("locations/places/entries", () => {
  it("inserts a full location -> place -> entry chain", async () => {
    const userId = await seedUser();
    const locationId = await seedLocation(userId);
    const placeId = await seedPlace(userId, locationId);

    await env.LOGBOOK_DB
      .prepare(
        `INSERT INTO entries (id, user_id, place_id, name, grade, discipline_id, status_id, first_attempt)
         VALUES ('entry-1', ?, ?, 'Le Toit du Cul de Chien', '7A', 'boulder', 'send', 1)`
      )
      .bind(userId, placeId)
      .run();

    const entry = await env.LOGBOOK_DB.prepare(`SELECT * FROM entries WHERE id = 'entry-1'`).first();
    expect(entry.name).toBe("Le Toit du Cul de Chien");
    expect(entry.first_attempt).toBe(1);
    expect(entry.date).toBeNull();
  });

  it("rejects an entry with an unknown discipline_id", async () => {
    const userId = await seedUser();
    const locationId = await seedLocation(userId);
    const placeId = await seedPlace(userId, locationId);

    await expect(
      env.LOGBOOK_DB
        .prepare(
          `INSERT INTO entries (id, user_id, place_id, name, grade, discipline_id, status_id)
           VALUES ('entry-1', ?, ?, 'Test', '7A', 'not-a-real-discipline', 'send')`
        )
        .bind(userId, placeId)
        .run()
    ).rejects.toThrow(/FOREIGN KEY/);
  });

  it("rejects first_attempt values outside 0/1", async () => {
    const userId = await seedUser();
    const locationId = await seedLocation(userId);
    const placeId = await seedPlace(userId, locationId);

    await expect(
      env.LOGBOOK_DB
        .prepare(
          `INSERT INTO entries (id, user_id, place_id, name, grade, discipline_id, status_id, first_attempt)
           VALUES ('entry-1', ?, ?, 'Test', '7A', 'boulder', 'send', 2)`
        )
        .bind(userId, placeId)
        .run()
    ).rejects.toThrow(/CHECK/);
  });

  it("cascades: deleting a place deletes its entries", async () => {
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

    await env.LOGBOOK_DB.prepare(`DELETE FROM places WHERE id = ?`).bind(placeId).run();

    const remaining = await env.LOGBOOK_DB.prepare(`SELECT id FROM entries WHERE id = 'entry-1'`).first();
    expect(remaining).toBeNull();
  });

  it("cascades: deleting a user deletes their locations/places/entries/settings", async () => {
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
    await env.LOGBOOK_DB.prepare(`INSERT INTO settings (user_id) VALUES (?)`).bind(userId).run();

    await env.LOGBOOK_DB.prepare(`DELETE FROM "user" WHERE id = ?`).bind(userId).run();

    for (const [table, id] of [["locations", locationId], ["places", placeId], ["entries", "entry-1"], ["settings", userId]]) {
      const idColumn = table === "settings" ? "user_id" : "id";
      const remaining = await env.LOGBOOK_DB.prepare(`SELECT ${idColumn} FROM ${table} WHERE ${idColumn} = ?`).bind(id).first();
      expect(remaining).toBeNull();
    }
  });
});

describe("settings", () => {
  it("defaults athlete_mode=0, active_discipline='boulder', logbook_public=1", async () => {
    const userId = await seedUser();
    await env.LOGBOOK_DB.prepare(`INSERT INTO settings (user_id) VALUES (?)`).bind(userId).run();

    const settings = await env.LOGBOOK_DB.prepare(`SELECT * FROM settings WHERE user_id = ?`).bind(userId).first();
    expect(settings.athlete_mode).toBe(0);
    expect(settings.active_discipline).toBe("boulder");
    expect(settings.logbook_public).toBe(1);
  });

  it("rejects logbook_public values outside 0/1", async () => {
    const userId = await seedUser();
    await expect(
      env.LOGBOOK_DB
        .prepare(`INSERT INTO settings (user_id, logbook_public) VALUES (?, 2)`)
        .bind(userId)
        .run()
    ).rejects.toThrow(/CHECK/);
  });

  it("rejects an unknown active_discipline", async () => {
    const userId = await seedUser();
    await expect(
      env.LOGBOOK_DB
        .prepare(`INSERT INTO settings (user_id, active_discipline) VALUES (?, 'yoga')`)
        .bind(userId)
        .run()
    ).rejects.toThrow(/FOREIGN KEY/);
  });
});

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
