import { env } from "cloudflare:workers";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createAuthedSession, fetchJson, jsonRequest, resetAuthTables, seedPlace } from "./support.js";
import { handlePublicGet, publicRowToJson } from "../server/api/entries.js";

const ENTRIES_URL = "/-/api/entries";

beforeAll(() => { env.BETA_GATE_ENABLED = "false"; });
afterAll(() => { env.BETA_GATE_ENABLED = "true"; });

let cookie;
let userId;
let placeId;
let locationId;

beforeEach(async () => {
  await resetAuthTables();
  ({ cookie, userId } = await createAuthedSession());
  placeId = await seedPlace(cookie);
  locationId = await locationIdOf(placeId);
});

async function locationIdOf(id, extraCookie = cookie) {
  const { places } = await (await fetchJson("/-/api/places", { headers: { Cookie: extraCookie } })).json();
  return places.find(p => p.id === id).locationId;
}

function get(extraCookie = cookie) {
  return fetchJson(ENTRIES_URL, { headers: { Cookie: extraCookie } });
}
function post(body, extraCookie = cookie) {
  return jsonRequest("POST", ENTRIES_URL, body, { Cookie: extraCookie });
}
function put(body, extraCookie = cookie) {
  return jsonRequest("PUT", ENTRIES_URL, body, { Cookie: extraCookie });
}
function del(id, extraCookie = cookie) {
  const path = id === undefined ? ENTRIES_URL : `${ENTRIES_URL}?id=${encodeURIComponent(id)}`;
  return fetchJson(path, { method: "DELETE", headers: { Cookie: extraCookie } });
}

function validEntry() {
  return {
    name: "La Marie-Rose",
    grade: "6B",
    placeId,
    type: "boulder",
    status: "send",
  };
}

describe("handleGet", () => {
  it("401s an anonymous caller (#992)", async () => {
    const res = await fetchJson(ENTRIES_URL);
    expect(res.status).toBe(401);
  });

  it("returns the logged-in caller's own entries", async () => {
    await post(validEntry());
    const res = await get();
    const { entries } = await res.json();
    expect(entries).toHaveLength(1);
    expect(entries[0].name).toBe("La Marie-Rose");
  });

  it("excludes a soft-deleted entry", async () => {
    const created = await (await post(validEntry())).json();
    await del(created.entries[0].id);

    const { entries } = await (await get()).json();
    expect(entries).toEqual([]);
  });
});

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

describe("handleGet (flat limit/offset, no locationId -- #498 chunked full sync)", () => {
  function getChunk(params, extraCookie = cookie) {
    const qs = new URLSearchParams(params).toString();
    return fetchJson(`${ENTRIES_URL}?${qs}`, { headers: { Cookie: extraCookie } });
  }

  it("returns a capped, offset slice ordered the same way listForUser() would, plus the true total", async () => {
    for (let i = 0; i < 5; i++) await post({ ...validEntry(), name: `Route ${i}` });

    const first = await (await getChunk({ limit: "2" })).json();
    expect(first.entries.map(e => e.name)).toEqual(["Route 0", "Route 1"]);
    expect(first.total).toBe(5);

    const second = await (await getChunk({ limit: "2", offset: "2" })).json();
    expect(second.entries.map(e => e.name)).toEqual(["Route 2", "Route 3"]);
    expect(second.total).toBe(5);

    const last = await (await getChunk({ limit: "2", offset: "4" })).json();
    expect(last.entries.map(e => e.name)).toEqual(["Route 4"]);
    expect(last.total).toBe(5);
  });

  it("offset past the end returns an empty (not error) chunk", async () => {
    await post(validEntry());
    const res = await getChunk({ limit: "20", offset: "50" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ entries: [], total: 0, cursor: 0 });
  });

  it("401s an anonymous caller (#992)", async () => {
    const res = await getChunk({ limit: "20" }, "");
    expect(res.status).toBe(401);
  });

  it("cross-user isolation -- a chunk never includes another user's entries", async () => {
    await post(validEntry());
    const otherUser = await createAuthedSession();
    const res = await getChunk({ limit: "20" }, otherUser.cookie);
    expect(await res.json()).toEqual({ entries: [], total: 0, cursor: 0 });
  });

  it("reports the max sync_cursor across every matching row, the same value on every chunk", async () => {
    for (let i = 0; i < 3; i++) await post({ ...validEntry(), name: `Route ${i}` });
    const ids = (await (await get()).json()).entries.map(e => e.id);
    const cursors = await Promise.all(ids.map(id =>
      env.LOGBOOK_DB.prepare(`SELECT sync_cursor FROM entries WHERE id = ?`).bind(id).first().then(r => r.sync_cursor)));
    const maxCursor = Math.max(...cursors);

    const first = await (await getChunk({ limit: "2", offset: "0" })).json();
    const second = await (await getChunk({ limit: "2", offset: "2" })).json();
    expect(first.cursor).toBe(maxCursor);
    expect(second.cursor).toBe(maxCursor);
  });

  it("defaults offset to 0 when omitted", async () => {
    await post({ ...validEntry(), name: "Only Route" });
    const res = await getChunk({ limit: "20" });
    const { entries } = await res.json();
    expect(entries.map(e => e.name)).toEqual(["Only Route"]);
  });

  it("excludes a soft-deleted entry from both the chunk and its total", async () => {
    const created = await (await post(validEntry())).json();
    await post({ ...validEntry(), name: "Still Here" });
    await del(created.entries[0].id);

    const { entries, total } = await (await getChunk({ limit: "20" })).json();
    expect(entries.map(e => e.name)).toEqual(["Still Here"]);
    expect(total).toBe(1);
  });
});

describe("handleGet (locationId -- #111 per-table pagination)", () => {
  function getLocation(id, params = {}, extraCookie = cookie) {
    const qs = new URLSearchParams({ locationId: id, ...params }).toString();
    return fetchJson(`${ENTRIES_URL}?${qs}`, { headers: { Cookie: extraCookie } });
  }

  it("returns only that location's entries, across every place under it", async () => {
    const secondPlaceId = (await (await jsonRequest("POST", "/-/api/places", { locationId, area: "Second Area" }, { Cookie: cookie })).json()).places.at(-1).id;
    const otherLocationPlaceId = await seedPlace(cookie, { locationName: "Other Crag" });
    await post(validEntry());
    await post({ ...validEntry(), name: "Second Area Route", placeId: secondPlaceId });
    await post({ ...validEntry(), name: "Elsewhere", placeId: otherLocationPlaceId });

    const { entries } = await (await getLocation(locationId)).json();
    expect(entries.map(e => e.name).sort()).toEqual(["La Marie-Rose", "Second Area Route"]);
  });

  it("paginates via limit/offset, ordered by creation order", async () => {
    for (let i = 0; i < 5; i++) {
      await post({ ...validEntry(), id: `e${i}`, name: `Route ${i}` });
    }
    const page1 = await (await getLocation(locationId, { limit: "2", offset: "0" })).json();
    expect(page1.entries.map(e => e.name)).toEqual(["Route 0", "Route 1"]);
    const page2 = await (await getLocation(locationId, { limit: "2", offset: "2" })).json();
    expect(page2.entries.map(e => e.name)).toEqual(["Route 2", "Route 3"]);
  });

  it("defaults to a page size of 20 when limit is omitted", async () => {
    for (let i = 0; i < 25; i++) {
      await post({ ...validEntry(), id: `e${i}`, name: `Route ${i}` });
    }
    const { entries } = await (await getLocation(locationId)).json();
    expect(entries).toHaveLength(20);
  });

  it("excludes a soft-deleted entry", async () => {
    const created = await (await post(validEntry())).json();
    await del(created.entries[0].id);

    const { entries } = await (await getLocation(locationId)).json();
    expect(entries).toEqual([]);
  });

  it("401s an anonymous caller (#992)", async () => {
    const res = await fetchJson(`${ENTRIES_URL}?locationId=${encodeURIComponent(locationId)}`);
    expect(res.status).toBe(401);
  });

  it("returns an empty list for a nonexistent locationId, not an error (anti-enumeration)", async () => {
    const res = await getLocation("does-not-exist");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ entries: [] });
  });

  it("returns an empty list for another user's own locationId (cross-user isolation)", async () => {
    await post(validEntry());
    const userB = await createAuthedSession();
    const res = await getLocation(locationId, {}, userB.cookie);
    expect(await res.json()).toEqual({ entries: [] });
  });
});

describe("handleGet (?since= -- #500 delta sync)", () => {
  function getSince(since, extraCookie = cookie) {
    return fetchJson(`${ENTRIES_URL}?since=${since}`, { headers: { Cookie: extraCookie } });
  }
  function cursorOf(id) {
    return env.LOGBOOK_DB.prepare(`SELECT sync_cursor FROM entries WHERE id = ?`).bind(id).first().then(r => r.sync_cursor);
  }

  it("401s an anonymous caller (#992)", async () => {
    const res = await fetchJson(`${ENTRIES_URL}?since=0`);
    expect(res.status).toBe(401);
  });

  it("returns nothing changed, cursor unchanged, when since is ahead of every row's cursor", async () => {
    await post(validEntry());
    const farFuture = Date.now() + 60_000;
    const res = await getSince(farFuture);
    expect(await res.json()).toEqual({ entries: [], cursor: farFuture });
  });

  it("returns a row created at or after since, and reports its own cursor as the new cursor", async () => {
    const created = await (await post(validEntry())).json();
    const id = created.entries[0].id;
    const cursor = await cursorOf(id);

    const { entries, cursor: newCursor } = await (await getSince(cursor)).json();
    expect(entries.map(e => e.id)).toEqual([id]);
    expect(entries[0].deleted).toBe(false);
    expect(newCursor).toBe(cursor);
  });

  it("excludes a row whose cursor is strictly before since", async () => {
    const created = await (await post(validEntry())).json();
    const id = created.entries[0].id;
    const cursor = await cursorOf(id);

    const { entries } = await (await getSince(cursor + 1)).json();
    expect(entries.find(e => e.id === id)).toBeUndefined();
  });

  it("includes a soft-deleted row, flagged deleted: true, unlike every other read path", async () => {
    const created = await (await post(validEntry())).json();
    const id = created.entries[0].id;

    await del(id);
    const deleteCursor = await cursorOf(id);

    const { entries } = await (await getSince(deleteCursor)).json();
    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe(id);
    expect(entries[0].deleted).toBe(true);
  });

  it("a delta fetch from 0 returns every live and tombstoned row for that user", async () => {
    const created = await (await post(validEntry())).json();
    const secondId = (await (await post({ ...validEntry(), name: "Second" })).json()).entries.find(e => e.name === "Second").id;
    await del(secondId);

    const { entries } = await (await getSince(0)).json();
    expect(entries.map(e => e.id).sort()).toEqual([created.entries[0].id, secondId].sort());
    expect(entries.find(e => e.id === secondId).deleted).toBe(true);
    expect(entries.find(e => e.id === created.entries[0].id).deleted).toBe(false);
  });

  it("never returns another user's rows (cross-user isolation)", async () => {
    await post(validEntry());
    const userB = await createAuthedSession();
    const res = await getSince(0, userB.cookie);
    expect(await res.json()).toEqual({ entries: [], cursor: 0 });
  });
});

describe("handlePost", () => {
  it("rejects an unauthenticated request", async () => {
    const res = await jsonRequest("POST", ENTRIES_URL, validEntry());
    expect(res.status).toBe(401);
  });

  it("creates an entry on the happy path", async () => {
    const res = await post(validEntry());
    expect(res.status).toBe(201);
    const { entries } = await res.json();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      name: "La Marie-Rose",
      grade: "6B",
      placeId,
      type: "boulder",
      status: "send",
      date: null,
      video: null,
      notes: null,
    });
    expect(typeof entries[0].id).toBe("string");
    expect(entries[0].id.length).toBeGreaterThan(0);
  });

  it("rejects malformed JSON", async () => {
    const res = await post("{not json");
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid JSON");
  });

  it.each(["placeId", "name", "grade", "type", "status"])(
    "rejects a missing %s",
    async (field) => {
      const entry = validEntry();
      delete entry[field];
      const res = await post(entry);
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe(`Missing required field: ${field}`);
    }
  );

  it("rejects an invalid type", async () => {
    const res = await post({ ...validEntry(), type: "trad" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/^type must be one of/);
  });

  it("rejects a grade not valid for the entry's type in any of its scales", async () => {
    const res = await post({ ...validEntry(), type: "boulder", grade: "VI+" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/^grade is not a valid grade for/);
  });

  it("accepts a grade valid for the sport type", async () => {
    const res = await post({ ...validEntry(), type: "sport", grade: "6a", sportStyle: "lead" });
    expect(res.status).toBe(201);
  });

  it("creates an entry with an explicit gradeScale, and reports it back", async () => {
    const res = await post({ ...validEntry(), gradeScale: "font-non-standard" });
    expect(res.status).toBe(201);
    const { entries } = await res.json();
    expect(entries[0].gradeScale).toBe("font-non-standard");
  });

  it("defaults gradeScale to font-non-standard for a Boulder entry when the client omits it", async () => {
    const res = await post(validEntry());
    const { entries } = await res.json();
    expect(entries[0].gradeScale).toBe("font-non-standard");
  });

  it("defaults gradeScale to french for a Sport entry using the current low end when the client omits it", async () => {
    const res = await post({ ...validEntry(), type: "sport", grade: "6a", sportStyle: "lead" });
    const { entries } = await res.json();
    expect(entries[0].gradeScale).toBe("french");
  });

  it.each(["1", "1+", "2", "2+", "3", "3+"])(
    "defaults gradeScale to french-non-standard for a Sport entry at the legacy pre-correction low end (grade %s)",
    async grade => {
      const res = await post({ ...validEntry(), type: "sport", grade, sportStyle: "lead" });
      const { entries } = await res.json();
      expect(entries[0].gradeScale).toBe("french-non-standard");
    }
  );

  it("rejects a gradeScale that doesn't belong to the entry's discipline", async () => {
    const res = await post({ ...validEntry(), gradeScale: "french" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/^gradeScale must be one of/);
  });

  it("rejects an invalid status", async () => {
    const res = await post({ ...validEntry(), status: "flashed" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/^status must be one of/);
  });

  it.each(["2026", "2026-07", "2026-07-30"])(
    "accepts a %s date shape",
    async (date) => {
      const res = await post({ ...validEntry(), date });
      expect(res.status).toBe(201);
    }
  );

  it("rejects a malformed date shape", async () => {
    const res = await post({ ...validEntry(), date: "30-07-2026" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("date must be YYYY, YYYY-MM, or YYYY-MM-DD");
  });

  it("rejects a non-http(s) video URL", async () => {
    const res = await post({ ...validEntry(), video: "ftp://example.com/clip" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("video must be an http(s) URL");
  });

  it("rejects an unparseable video URL", async () => {
    const res = await post({ ...validEntry(), video: "not a url" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("video must be a valid URL");
  });

  it("accepts a valid https video URL", async () => {
    const res = await post({ ...validEntry(), video: "https://example.com/clip" });
    expect(res.status).toBe(201);
    const { entries } = await res.json();
    expect(entries[0].video).toBe("https://example.com/clip");
  });

  it("rejects a placeId that doesn't exist", async () => {
    const res = await post({ ...validEntry(), placeId: "does-not-exist" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("placeId does not reference one of your places");
  });

  it("replays an existing id idempotently instead of erroring or duplicating", async () => {
    const entryWithId = { ...validEntry(), id: "fixed-id-1" };
    const first = await post(entryWithId);
    expect(first.status).toBe(201);

    const second = await post(entryWithId);
    expect(second.status).toBe(200);
    const { entries } = await second.json();
    expect(entries).toHaveLength(1);
  });

  it("resurrects a soft-deleted row when a create reuses its id, rather than silently no-op'ing", async () => {
    const entryWithId = { ...validEntry(), id: "resurrect-id-1" };
    const created = await post(entryWithId);
    expect(created.status).toBe(201);

    await del("resurrect-id-1");
    const afterDelete = await (await get()).json();
    expect(afterDelete.entries).toEqual([]);

    const recreated = await post({ ...validEntry(), id: "resurrect-id-1", name: "Resurrected" });
    expect(recreated.status).toBe(201);
    const { entries } = await recreated.json();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ id: "resurrect-id-1", name: "Resurrected" });

    const row = await env.LOGBOOK_DB.prepare(`SELECT deleted_at FROM entries WHERE id = ?`).bind("resurrect-id-1").first();
    expect(row.deleted_at).toBeNull();
  });

  it("a genuine idempotent replay of a still-live row is unaffected by the resurrect path", async () => {
    const entryWithId = { ...validEntry(), id: "still-live-id-1" };
    const first = await post(entryWithId);
    expect(first.status).toBe(201);

    const second = await post({ ...validEntry(), id: "still-live-id-1", name: "Should Not Apply" });
    expect(second.status).toBe(200);
    const { entries } = await second.json();
    expect(entries).toHaveLength(1);
    expect(entries[0].name).toBe(entryWithId.name);
  });

  it("sets firstAttempt true only when status is send", async () => {
    const res = await post({ ...validEntry(), status: "send", firstAttempt: true });
    const { entries } = await res.json();
    expect(entries[0].firstAttempt).toBe(true);
  });

  it("forces firstAttempt false when status is not send, even if requested true", async () => {
    const res = await post({ ...validEntry(), status: "project", firstAttempt: true });
    const { entries } = await res.json();
    expect(entries[0].firstAttempt).toBe(false);
  });

  it("persists and returns sportStyle for a sport entry", async () => {
    const res = await post({ ...validEntry(), type: "sport", grade: "6a", sportStyle: "top_rope" });
    const { entries } = await res.json();
    expect(entries[0].sportStyle).toBe("top_rope");
  });

  it("rejects a sport entry with no sportStyle at all", async () => {
    const res = await post({ ...validEntry(), type: "sport", grade: "6a" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Missing required field: sportStyle");
  });

  it("null-coalesces omitted optional fields", async () => {
    const res = await post(validEntry());
    const { entries } = await res.json();
    expect(entries[0].date).toBeNull();
    expect(entries[0].video).toBeNull();
    expect(entries[0].notes).toBeNull();
  });

  it("populates sync_cursor on create", async () => {
    const before = Date.now();
    const res = await post(validEntry());
    const { entries } = await res.json();
    const row = await env.LOGBOOK_DB.prepare(`SELECT sync_cursor FROM entries WHERE id = ?`).bind(entries[0].id).first();
    expect(row.sync_cursor).toBeGreaterThanOrEqual(before);
  });
});

describe("handlePut", () => {
  it("rejects an unauthenticated request", async () => {
    const created = await (await post(validEntry())).json();
    const res = await jsonRequest("PUT", ENTRIES_URL, { ...validEntry(), id: created.entries[0].id, name: "Renamed" });
    expect(res.status).toBe(401);
  });

  it("updates an existing entry on the happy path", async () => {
    const created = await (await post(validEntry())).json();
    const id = created.entries[0].id;

    const res = await put({ ...validEntry(), id, name: "Renamed" });
    expect(res.status).toBe(200);
    const { entries } = await res.json();
    expect(entries[0].name).toBe("Renamed");
  });

  it("rejects a missing id", async () => {
    const res = await put(validEntry());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Missing required field: id");
  });

  it("404s when the id doesn't exist", async () => {
    const res = await put({ ...validEntry(), id: "does-not-exist" });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("Entry not found");
  });

  it("passes through validation errors", async () => {
    const created = await (await post(validEntry())).json();
    const id = created.entries[0].id;

    const res = await put({ ...validEntry(), id, status: "flashed" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/^status must be one of/);
  });

  it("404s when the id belongs to a soft-deleted entry", async () => {
    const created = await (await post(validEntry())).json();
    const id = created.entries[0].id;
    await del(id);

    const res = await put({ ...validEntry(), id, name: "Renamed" });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("Entry not found");
  });

  it("bumps sync_cursor on a real edit", async () => {
    const created = await (await post(validEntry())).json();
    const id = created.entries[0].id;
    const before = await env.LOGBOOK_DB.prepare(`SELECT sync_cursor FROM entries WHERE id = ?`).bind(id).first();

    await put({ ...validEntry(), id, name: "Renamed" });

    const after = await env.LOGBOOK_DB.prepare(`SELECT sync_cursor FROM entries WHERE id = ?`).bind(id).first();
    expect(after.sync_cursor).toBeGreaterThanOrEqual(before.sync_cursor);
  });
});

describe("handleDelete", () => {
  it("rejects an unauthenticated request", async () => {
    const created = await (await post(validEntry())).json();
    const res = await fetchJson(`${ENTRIES_URL}?id=${created.entries[0].id}`, { method: "DELETE" });
    expect(res.status).toBe(401);
  });

  it("deletes an existing entry on the happy path", async () => {
    const created = await (await post(validEntry())).json();
    const id = created.entries[0].id;

    const res = await del(id);
    expect(res.status).toBe(200);
    const { entries } = await res.json();
    expect(entries).toHaveLength(0);
  });

  it("rejects a missing id", async () => {
    const res = await del();
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Missing required field: id");
  });

  it("is idempotent when the id doesn't exist, rather than erroring (#268)", async () => {
    const res = await del("does-not-exist");
    expect(res.status).toBe(200);
    const { entries } = await res.json();
    expect(entries).toEqual([]);
  });

  it("idempotent delete leaves other entries untouched", async () => {
    const created = await (await post(validEntry())).json();
    const id = created.entries[0].id;

    const res = await del("does-not-exist");
    expect(res.status).toBe(200);
    const { entries } = await res.json();
    expect(entries).toEqual([created.entries[0]]);
    expect(entries.find(e => e.id === id)).toBeDefined();
  });

  it("soft-deletes -- the row still exists in D1, just excluded from reads", async () => {
    const created = await (await post(validEntry())).json();
    const id = created.entries[0].id;

    await del(id);

    const row = await env.LOGBOOK_DB.prepare(`SELECT deleted_at FROM entries WHERE id = ?`).bind(id).first();
    expect(row.deleted_at).not.toBeNull();
    expect(typeof row.deleted_at).toBe("number");
  });

  it("bumps sync_cursor on delete, same as a real change a future delta fetch needs to see", async () => {
    const created = await (await post(validEntry())).json();
    const id = created.entries[0].id;
    const before = await env.LOGBOOK_DB.prepare(`SELECT sync_cursor FROM entries WHERE id = ?`).bind(id).first();

    await del(id);

    const after = await env.LOGBOOK_DB.prepare(`SELECT sync_cursor, deleted_at FROM entries WHERE id = ?`).bind(id).first();
    expect(after.sync_cursor).toBeGreaterThanOrEqual(before.sync_cursor);
    expect(after.sync_cursor).toBe(after.deleted_at);
  });
});

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

  it("a plain GET succeeds and returns every entry once entry count crosses the 100-bound-parameter chunk boundary", async () => {
    for (let i = 0; i < 105; i++) await post({ ...validEntry(), name: `Route ${i}` });

    const res = await get();
    expect(res.status).toBe(200);
    const { entries } = await res.json();
    expect(entries).toHaveLength(105);
    for (const entry of entries) {
      expect(entry.moves).toEqual([]);
      expect(entry.painMoves).toEqual([]);
    }
  }, 60000);
});

describe("cross-user isolation", () => {
  it("a second user's own GET never sees the first user's entries", async () => {
    await post(validEntry());

    const userB = await createAuthedSession();
    const res = await get(userB.cookie);
    expect(await res.json()).toEqual({ entries: [] });
  });

  it("a second user cannot update the first user's entry by forging its id", async () => {
    const created = await (await post(validEntry())).json();
    const id = created.entries[0].id;

    const userB = await createAuthedSession();
    const placeIdB = await seedPlace(userB.cookie);
    const res = await put({ ...validEntry(), placeId: placeIdB, id, name: "Hijacked" }, userB.cookie);
    expect(res.status).toBe(404);

    const stillOwned = await (await get()).json();
    expect(stillOwned.entries[0].name).toBe("La Marie-Rose");
  });

  it("a second user's delete of a forged id doesn't remove the first user's entry", async () => {
    const created = await (await post(validEntry())).json();
    const id = created.entries[0].id;

    const userB = await createAuthedSession();
    const res = await del(id, userB.cookie);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ entries: [] }); // B's own (empty) list, not A's

    const stillOwned = await (await get()).json();
    expect(stillOwned.entries).toHaveLength(1);
  });

  it("a second user cannot create an entry against the first user's place", async () => {
    const userB = await createAuthedSession();
    const res = await post({ ...validEntry(), placeId }, userB.cookie);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("placeId does not reference one of your places");
  });
});

describe("publicRowToJson / handlePublicGet (Task 7 -- public profile exclusions)", () => {
  it("publicRowToJson omits rpe and attemptsToSend", () => {
    const row = { id: "e1", name: "Test", grade: "6B", place_id: "p1", discipline_id: "boulder", status_id: "send", first_attempt: 0, date: "2026-01-01", video: null, notes: null, rpe: 80, attempts_to_send: 5 };
    const json = publicRowToJson(row);
    expect(json).not.toHaveProperty("rpe");
    expect(json).not.toHaveProperty("attemptsToSend");
    expect(json).toMatchObject({ id: "e1", name: "Test", grade: "6B", placeId: "p1", type: "boulder", status: "send" });
  });

  it("handlePublicGet's response has no rpe/attemptsToSend/moves/painMoves keys on any entry", async () => {
    await post({ ...validEntry(), rpe: 80, attemptsToSend: 5, moves: [validMoveRow()], painMoves: [validPainRow()] });
    const request = new Request("https://example.com/-/api/entries");
    const res = await handlePublicGet(request, env, userId);
    const { entries } = await res.json();
    expect(entries).toHaveLength(1);
    expect(entries[0]).not.toHaveProperty("rpe");
    expect(entries[0]).not.toHaveProperty("attemptsToSend");
    expect(entries[0]).not.toHaveProperty("moves");
    expect(entries[0]).not.toHaveProperty("painMoves");
    expect(entries[0].name).toBe(validEntry().name);
  });
});
