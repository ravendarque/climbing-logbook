import { env, exports } from "cloudflare:workers";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanUp } from "../server/lib/cleanup.js";
import { createAuthedSession, fetchJson, jsonRequest, resetAuthTables, seedPlace } from "./support.js";

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
      moves: [{ ...MOVE, difficulty: "hardest" }],
      painMoves: [MOVE],
    },
    { Cookie: cookie },
  );
}

const content = id =>
  db
    .prepare(
      `SELECT name, notes, video, date, deleted_at IS NOT NULL AS deleted,
         (SELECT count(*) FROM entry_moves WHERE entry_id = ?1) AS moves,
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
      deleted: 1,
      moves: 0,
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

    expect(await content("old-tombstone")).toMatchObject({ name: "", notes: null, moves: 0, painMoves: 0 });
    expect(log.info).toHaveBeenCalledWith("cleanup.done", { reason: "deleted-entry-content", count: 1 });
  });

  it("leaves live climbs alone", async () => {
    await climbWithEverything("alive");
    await cleanUp(env, log);
    expect(await content("alive")).toMatchObject({
      name: "Private Project",
      notes: "Fell off the crux twice",
      moves: 1,
    });
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
