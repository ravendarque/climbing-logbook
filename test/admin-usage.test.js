import { env, exports } from "cloudflare:workers";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createAuthedSession, resetAuthTables } from "./support.js";

const usage = async () => (await exports.default.fetch("https://admin.example.com/-/api/admin/usage")).json();

function run(sql, ...values) {
  return env.LOGBOOK_DB.prepare(sql)
    .bind(...values)
    .run();
}

async function place(userId, id, { location, country }) {
  await run(
    `INSERT OR IGNORE INTO locations (id, user_id, name, country) VALUES (?, ?, ?, ?)`,
    `${id}-loc`,
    userId,
    location,
    country,
  );
  await run(`INSERT INTO places (id, user_id, location_id) VALUES (?, ?, ?)`, id, userId, `${id}-loc`);
}

async function entry(
  userId,
  id,
  placeId,
  { discipline = "boulder", status = "send", flash = 0, daysAgo = 0, deleted = false } = {},
) {
  await run(
    `INSERT INTO entries (id, user_id, place_id, name, grade, discipline_id, status_id, first_attempt, created_at, deleted_at)
     VALUES (?, ?, ?, 'Climb', '6A', ?, ?, ?, datetime('now', ?), ?)`,
    id,
    userId,
    placeId,
    discipline,
    status,
    flash,
    `-${daysAgo} days`,
    deleted ? Date.now() : null,
  );
}

beforeAll(() => {
  env.BETA_GATE_ENABLED = "false";
  env.ADMIN_ACCESS_CHECK = "off";
});
afterAll(() => {
  env.BETA_GATE_ENABLED = "true";
  delete env.ADMIN_ACCESS_CHECK;
});

beforeEach(async () => {
  await resetAuthTables();
  await run(`DELETE FROM import_runs`);
});

describe("usage figures", () => {
  it("counts real accounts only, with recent activity, take-up, the status and discipline splits, and places by country", async () => {
    const { userId: a } = await createAuthedSession();
    const { userId: b } = await createAuthedSession();
    const { userId: demo } = await createAuthedSession();
    await run(`UPDATE "user" SET createdAt = ? WHERE id = ?`, new Date(Date.now() - 40 * 864e5).toISOString(), b);
    await run(`INSERT INTO settings (user_id, athlete_mode) VALUES (?, 1)`, a);
    await run(`INSERT INTO settings (user_id, logbook_public) VALUES (?, 0)`, b);
    await run(`INSERT INTO settings (user_id, is_demo, athlete_mode) VALUES (?, 1, 1)`, demo);

    await place(a, "a-p1", { location: "Peak District", country: "United Kingdom" });
    await run(`INSERT INTO places (id, user_id, location_id, area) VALUES ('a-p2', ?, 'a-p1-loc', 'Stanage')`, a);
    await place(a, "a-p3", { location: "Fontainebleau", country: "France" });
    await entry(a, "e1", "a-p1", { flash: 1 });
    await entry(a, "e2", "a-p2", { daysAgo: 60 });
    await entry(a, "e3", "a-p3", { discipline: "sport", status: "project" });
    await entry(a, "e4", "a-p3", { deleted: true });
    await place(demo, "d-p1", { location: "Rocklands", country: "South Africa" });
    await entry(demo, "d1", "d-p1");
    await run(`INSERT INTO import_runs (id, user_id, entries) VALUES ('i1', ?, 3), ('i2', ?, 5)`, a, demo);

    const figures = await usage();
    expect(figures).toMatchObject({
      users: 2,
      newUsers: 1,
      climbs: 3,
      recentClimbs: 2,
      activeUsers: 1,
      places: 3,
      countryCount: 2,
      athleteMode: 1,
      publicLogbooks: 1,
      importUsers: 1,
      importsSince: expect.any(String),
      statuses: { flash: 1, send: 1, project: 1 },
      disciplines: { boulder: 2, sport: 1 },
    });
    expect(figures.countries).toEqual([
      {
        country: "United Kingdom",
        places: 2,
        climbs: 2,
        locations: [{ location: "Peak District", places: 2, climbs: 2 }],
      },
      { country: "France", places: 1, climbs: 1, locations: [{ location: "Fontainebleau", places: 1, climbs: 1 }] },
    ]);
  });

  it("is all zeros with nobody signed up", async () => {
    expect(await usage()).toMatchObject({
      users: 0,
      climbs: 0,
      places: 0,
      statuses: {},
      disciplines: {},
      countries: [],
    });
  });
});
