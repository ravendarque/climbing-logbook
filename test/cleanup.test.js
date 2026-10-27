import { env, exports } from "cloudflare:workers";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanUp } from "../server/lib/cleanup.js";
import {
  createAuthedSession,
  fetchJson,
  grantPainInjuryConsent,
  jsonRequest,
  resetAuthTables,
  seedPlace,
} from "./support.js";

beforeAll(() => {
  env.BETA_GATE_ENABLED = "false";
});
afterAll(() => {
  env.BETA_GATE_ENABLED = "true";
});

const DAY_MS = 24 * 60 * 60 * 1000;
const MOVE = { limb: "hand", side: "left", holdType: "crimp", movementStyle: "static", wallAngle: "vert" };
const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
const db = env.LOGBOOK_DB;

let cookie;
let userId;
beforeEach(async () => {
  await resetAuthTables();
  ({ cookie, userId } = await createAuthedSession());
  log.info.mockClear();
});

async function climbWithEverything(id) {
  const placeId = await seedPlace(cookie);
  await grantPainInjuryConsent(cookie);
  await jsonRequest(
    "POST",
    "/-/api/entries",
    {
      id,
      placeId,
      name: "Private Project",
      grade: "7A",
      type: "boulder",
      status: "send",
      date: "2026-10-01",
      notes: "Fell off the crux twice",
      video: "https://youtu.be/abc",
      hardestBeta: "Heel hook the lip, cross to the crimp",
      painMoves: [MOVE],
    },
    { Cookie: cookie },
  );
}

const content = id =>
  db
    .prepare(
      `SELECT name, notes, video, date, hardest_beta AS hardestBeta, deleted_at IS NOT NULL AS deleted,
         (SELECT count(*) FROM entry_movements WHERE entry_id = ?1) AS movements,
         (SELECT count(*) FROM entry_pain_moves WHERE entry_id = ?1) AS painMoves
       FROM entries WHERE id = ?1`,
    )
    .bind(id)
    .first();

describe("deleting a climb (#1051)", () => {
  it("keeps only a tombstone, with none of what it said", async () => {
    await climbWithEverything("doomed");
    await fetchJson("/-/api/entries?id=doomed", { method: "DELETE", headers: { Cookie: cookie } });

    expect(await content("doomed")).toEqual({
      name: "",
      notes: null,
      video: null,
      date: null,
      hardestBeta: null,
      deleted: 1,
      movements: 0,
      painMoves: 0,
    });
  });
});

describe("the daily clean-up (#1051)", () => {
  const insertSession = (id, expiresAt) =>
    db
      .prepare(
        `INSERT INTO "session" (id, "expiresAt", token, "createdAt", "updatedAt", "ipAddress", "userAgent", "userId")
         VALUES (?, ?, ?, ?, ?, '203.0.113.1', 'test', ?)`,
      )
      .bind(id, expiresAt, `token-${id}`, expiresAt, expiresAt, userId)
      .run();

  it("deletes sessions expired over a week ago, and expired links, and keeps the rest", async () => {
    const now = Date.now();
    await insertSession("long-gone", new Date(now - 8 * DAY_MS).toISOString());
    await insertSession("recently-expired", new Date(now - 2 * DAY_MS).toISOString());
    await db
      .prepare(
        `INSERT INTO verification (id, identifier, value, "expiresAt", "createdAt", "updatedAt") VALUES
         ('old-link', 'a', 'x', ?1, ?1, ?1), ('live-link', 'b', 'y', ?2, ?2, ?2)`,
      )
      .bind(new Date(now - 1000).toISOString(), new Date(now + DAY_MS).toISOString())
      .run();

    await cleanUp(env, log, now);

    const sessions = (await db.prepare(`SELECT id FROM "session" WHERE id IN ('long-gone', 'recently-expired')`).all())
      .results;
    expect(sessions.map(s => s.id)).toEqual(["recently-expired"]);
    const links = (await db.prepare(`SELECT id FROM verification WHERE id IN ('old-link', 'live-link')`).all()).results;
    expect(links.map(l => l.id)).toEqual(["live-link"]);
  });

  it("strips anything left on climbs deleted before deletes stripped them, and logs what it did", async () => {
    await climbWithEverything("old-tombstone");
    await db.prepare(`UPDATE entries SET deleted_at = 1 WHERE id = 'old-tombstone'`).run();

    await cleanUp(env, log);

    expect(await content("old-tombstone")).toMatchObject({
      name: "",
      notes: null,
      hardestBeta: null,
      movements: 0,
      painMoves: 0,
    });
    expect(log.info).toHaveBeenCalledWith("cleanup.done", { reason: "deleted-entry-content", count: 1 });
  });

  it("leaves live climbs alone", async () => {
    await climbWithEverything("alive");
    await cleanUp(env, log);
    expect(await content("alive")).toMatchObject({
      name: "Private Project",
      notes: "Fell off the crux twice",
      hardestBeta: "Heel hook the lip, cross to the crimp",
      movements: 1,
    });
  });
});

describe("purging tombstones after 30 days (#1051)", () => {
  beforeEach(async () => {
    await db.batch([db.prepare(`DELETE FROM entries`), db.prepare(`DELETE FROM entry_purge_floors`)]);
  });

  const ids = async () =>
    (await db.prepare(`SELECT id FROM entries ORDER BY sync_cursor`).all()).results.map(r => r.id);
  const cursorOf = async id =>
    (await db.prepare(`SELECT sync_cursor FROM entries WHERE id = ?`).bind(id).first()).sync_cursor;
  const deleteClimb = id => fetchJson(`/-/api/entries?id=${id}`, { method: "DELETE", headers: { Cookie: cookie } });
  const delta = since => fetchJson(`/-/api/entries?since=${since}`, { headers: { Cookie: cookie } });

  it("hard-deletes tombstones over 30 days old, keeps newer ones and the newest row, and records the purge point", async () => {
    const now = Date.now();
    for (const id of ["old", "recent", "newest"]) await climbWithEverything(id);
    for (const id of ["old", "recent", "newest"]) await deleteClimb(id);
    await db
      .prepare(`UPDATE entries SET deleted_at = ? WHERE id IN ('old', 'newest')`)
      .bind(now - 31 * DAY_MS)
      .run();
    await db
      .prepare(`UPDATE entries SET deleted_at = ? WHERE id = 'recent'`)
      .bind(now - 29 * DAY_MS)
      .run();
    const oldCursor = await cursorOf("old");

    await cleanUp(env, log, now);

    expect(await ids()).toEqual(["recent", "newest"]);
    const floor = await db.prepare(`SELECT cursor FROM entry_purge_floors WHERE user_id = ?`).bind(userId).first();
    expect(floor.cursor).toBe(oldCursor);
    expect(log.info).toHaveBeenCalledWith("cleanup.done", { reason: "tombstones", count: 1 });
  });

  it("tells a device that synced before the purge point to sync again in full, and serves the rest", async () => {
    const now = Date.now();
    for (const id of ["gone", "kept"]) await climbWithEverything(id);
    const before = await cursorOf("gone");
    await deleteClimb("gone");
    await db
      .prepare(`UPDATE entries SET deleted_at = ? WHERE id = 'gone'`)
      .bind(now - 31 * DAY_MS)
      .run();
    await climbWithEverything("later");
    const after = await cursorOf("later");

    await cleanUp(env, log, now);

    const stale = await delta(before);
    expect(stale.status).toBe(410);
    expect((await delta(0)).status).toBe(200);
    const fresh = await delta(after);
    expect(fresh.status).toBe(200);
    expect((await fresh.json()).entries.map(e => e.id)).toEqual(["later"]);
  });

  it("keeps the purge point when a later run purges older tombstones", async () => {
    await db.prepare(`INSERT INTO entry_purge_floors (user_id, cursor) VALUES (?, 1000)`).bind(userId).run();
    for (const id of ["a", "b"]) await climbWithEverything(id);
    await deleteClimb("a");
    await db.prepare(`UPDATE entries SET deleted_at = 1 WHERE id = 'a'`).run();

    await cleanUp(env, log);

    const floor = await db.prepare(`SELECT cursor FROM entry_purge_floors WHERE user_id = ?`).bind(userId).first();
    expect(floor.cursor).toBe(1000);
  });
});

describe("the cron trigger (#1051)", () => {
  it("runs the clean-up when Cloudflare fires it", async () => {
    await climbWithEverything("cron-tombstone");
    await db.prepare(`UPDATE entries SET deleted_at = 1 WHERE id = 'cron-tombstone'`).run();

    await exports.default.scheduled({ scheduledTime: Date.now(), cron: "17 3 * * *" });

    expect(await content("cron-tombstone")).toMatchObject({ name: "", notes: null });
  });
});
