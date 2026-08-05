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
    expect(results.map(r => r.id)).toEqual(["abandoned", "project", "send", "wishlist"]);
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
