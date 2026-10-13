import { env } from "cloudflare:workers";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createAuthedSession, fetchJson, jsonRequest, resetAuthTables, seedPlace } from "./support.js";
import { buildRow, handlePublicGet, publicRowToJson } from "../server/api/entries.js";
import { buildInsertStatement } from "../server/lib/d1-resource.js";

const ENTRIES_URL = "/-/api/entries";

beforeAll(() => {
  env.BETA_GATE_ENABLED = "false";
});
afterAll(() => {
  env.BETA_GATE_ENABLED = "true";
});

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
    await del(created.entry.id);

    const { entries } = await (await get()).json();
    expect(entries).toEqual([]);
  });
});

describe("attemptsToSend / rpe", () => {
  it("round-trips attemptsToSend and rpe through create", async () => {
    const created = await (await post({ ...validEntry(), attemptsToSend: 5, rpe: 80 })).json();
    expect(created.entry.attemptsToSend).toBe(5);
    expect(created.entry.rpe).toBe(80);
  });

  it("defaults both to null when omitted", async () => {
    const created = await (await post(validEntry())).json();
    expect(created.entry.attemptsToSend).toBeNull();
    expect(created.entry.rpe).toBeNull();
  });

  it("round-trips both through edit", async () => {
    const created = await (await post(validEntry())).json();
    const updated = await (await put({ ...created.entry, attemptsToSend: 3, rpe: 60 })).json();
    expect(updated.entry.attemptsToSend).toBe(3);
    expect(updated.entry.rpe).toBe(60);
  });

  it("rejects an invalid rpe on create", async () => {
    const res = await post({ ...validEntry(), rpe: 55 });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("rpe must be a multiple of 10 between 0 and 100");
  });
});

describe("handleGet (?limit=, chunked full sync)", () => {
  function getChunk(params, extraCookie = cookie) {
    const qs = new URLSearchParams(params).toString();
    return fetchJson(`${ENTRIES_URL}?${qs}`, { headers: { Cookie: extraCookie } });
  }

  function getAfter(next) {
    return getChunk({ limit: "2", afterCreatedAt: next.createdAt, afterId: next.id });
  }

  it("returns capped chunks in key order, each with the true total", async () => {
    for (let i = 0; i < 5; i++) await post({ ...validEntry(), id: `e${i}`, name: `Route ${i}` });

    const first = await (await getChunk({ limit: "2" })).json();
    expect(first.entries.map(e => e.name)).toEqual(["Route 0", "Route 1"]);
    expect(first.total).toBe(5);

    const second = await (await getAfter(first.next)).json();
    expect(second.entries.map(e => e.name)).toEqual(["Route 2", "Route 3"]);
    expect(second.total).toBe(5);

    const last = await (await getAfter(second.next)).json();
    expect(last.entries.map(e => e.name)).toEqual(["Route 4"]);
    expect(last.total).toBe(5);
  });

  it("a key past the end returns an empty (not error) chunk", async () => {
    await post({ ...validEntry(), id: "e0" });
    const res = await getAfter({ createdAt: "9999-12-31 23:59:59", id: "" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ entries: [], total: 0, cursor: 0, next: null });
  });

  it("401s an anonymous caller (#992)", async () => {
    const res = await getChunk({ limit: "20" }, "");
    expect(res.status).toBe(401);
  });

  it("cross-user isolation -- a chunk never includes another user's entries", async () => {
    await post(validEntry());
    const otherUser = await createAuthedSession();
    const res = await getChunk({ limit: "20" }, otherUser.cookie);
    expect(await res.json()).toEqual({ entries: [], total: 0, cursor: 0, next: null });
  });

  it("reports the max sync_cursor across every matching row, the same value on every chunk", async () => {
    for (let i = 0; i < 3; i++) await post({ ...validEntry(), name: `Route ${i}` });
    const ids = (await (await get()).json()).entries.map(e => e.id);
    const cursors = await Promise.all(
      ids.map(id =>
        env.LOGBOOK_DB.prepare(`SELECT sync_cursor FROM entries WHERE id = ?`)
          .bind(id)
          .first()
          .then(r => r.sync_cursor),
      ),
    );
    const maxCursor = Math.max(...cursors);

    const first = await (await getChunk({ limit: "2" })).json();
    const second = await (await getAfter(first.next)).json();
    expect(first.cursor).toBe(maxCursor);
    expect(second.cursor).toBe(maxCursor);
  });

  it("pages by key, so a delete mid-sync skips no live row", async () => {
    for (let i = 0; i < 5; i++) await post({ ...validEntry(), id: `e${i}`, name: `Route ${i}` });

    const first = await (await getChunk({ limit: "2" })).json();
    expect(first.entries.map(e => e.id)).toEqual(["e0", "e1"]);
    await del("e0");

    const names = [];
    for (let next = first.next; next; ) {
      const chunk = await (await getChunk({ limit: "2", afterCreatedAt: next.createdAt, afterId: next.id })).json();
      names.push(...chunk.entries.map(e => e.id));
      next = chunk.next;
    }
    expect(names).toEqual(["e2", "e3", "e4"]);

    const { entries } = await (
      await fetchJson(`${ENTRIES_URL}?since=${first.cursor}`, { headers: { Cookie: cookie } })
    ).json();
    expect(entries.find(e => e.id === "e0")?.deleted).toBe(true);
  });

  it.each(["0", "", "-1", "2.5", "abc"])("400s a limit of %j", async limit => {
    const res = await getChunk({ limit });
    expect(res.status).toBe(400);
  });

  it("400s a limit above the maximum chunk size", async () => {
    const res = await getChunk({ limit: "1001" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("limit must be a whole number from 1 to 1000");
  });

  it("returns no next key on the last chunk", async () => {
    await post(validEntry());
    const chunk = await (await getChunk({ limit: "2" })).json();
    expect(chunk.next).toBeNull();
  });

  it("excludes a soft-deleted entry from both the chunk and its total", async () => {
    const created = await (await post(validEntry())).json();
    await post({ ...validEntry(), name: "Still Here" });
    await del(created.entry.id);

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

  it.each([
    ["limit", "-1"],
    ["limit", "abc"],
    ["limit", "0"],
    ["offset", "-1"],
    ["offset", "abc"],
  ])("400s %s=%j, rather than a negative LIMIT meaning no limit", async (name, value) => {
    const res = await getLocation(locationId, { [name]: value });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(new RegExp(`^${name} must be a whole number`));
  });

  it("returns only that location's entries, across every place under it", async () => {
    const secondPlaceId = (
      await (await jsonRequest("POST", "/-/api/places", { locationId, area: "Second Area" }, { Cookie: cookie })).json()
    ).place.id;
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
    await del(created.entry.id);

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

  it.each(["-1", "abc", "", "1.5"])("400s since=%j", async since => {
    const res = await getSince(since);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/^since must be a whole number/);
  });
  function cursorOf(id) {
    return env.LOGBOOK_DB.prepare(`SELECT sync_cursor FROM entries WHERE id = ?`)
      .bind(id)
      .first()
      .then(r => r.sync_cursor);
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
    const id = created.entry.id;
    const cursor = await cursorOf(id);

    const { entries, cursor: newCursor } = await (await getSince(cursor)).json();
    expect(entries.map(e => e.id)).toEqual([id]);
    expect(entries[0].deleted).toBe(false);
    expect(newCursor).toBe(cursor);
  });

  it("excludes a row whose cursor is strictly before since", async () => {
    const created = await (await post(validEntry())).json();
    const id = created.entry.id;
    const cursor = await cursorOf(id);

    const { entries } = await (await getSince(cursor + 1)).json();
    expect(entries.find(e => e.id === id)).toBeUndefined();
  });

  it("includes a soft-deleted row, flagged deleted: true, unlike every other read path", async () => {
    const created = await (await post(validEntry())).json();
    const id = created.entry.id;

    await del(id);
    const deleteCursor = await cursorOf(id);

    const { entries } = await (await getSince(deleteCursor)).json();
    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe(id);
    expect(entries[0].deleted).toBe(true);
  });

  it("a delta fetch from 0 returns every live and tombstoned row for that user", async () => {
    const created = await (await post(validEntry())).json();
    const secondId = (await (await post({ ...validEntry(), name: "Second" })).json()).entry.id;
    await del(secondId);

    const { entries } = await (await getSince(0)).json();
    expect(entries.map(e => e.id).sort()).toEqual([created.entry.id, secondId].sort());
    expect(entries.find(e => e.id === secondId).deleted).toBe(true);
    expect(entries.find(e => e.id === created.entry.id).deleted).toBe(false);
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

  it("creates an entry on the happy path, returning only that entry", async () => {
    const res = await post(validEntry());
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(Object.keys(body)).toEqual(["entry"]);
    const { entry } = body;
    expect(entry).toMatchObject({
      name: "La Marie-Rose",
      grade: "6B",
      placeId,
      type: "boulder",
      status: "send",
      date: null,
      video: null,
      notes: null,
    });
    expect(typeof entry.id).toBe("string");
    expect(entry.id.length).toBeGreaterThan(0);
  });

  it("rejects malformed JSON", async () => {
    const res = await post("{not json");
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid JSON");
  });

  it.each([
    [{ x: 1 }, "id must be a string"],
    ["not a valid id!", "id must be 1 to 64 letters, digits, - or _"],
  ])("400s id = %j on create and on edit", async (id, message) => {
    for (const res of [await post({ ...validEntry(), id }), await put({ ...validEntry(), id })]) {
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe(message);
    }
  });

  it.each(["placeId", "name", "grade", "type", "status"])("rejects a missing %s", async field => {
    const entry = validEntry();
    delete entry[field];
    const res = await post(entry);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(`Missing required field: ${field}`);
  });

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
    const { entry } = await res.json();
    expect(entry.gradeScale).toBe("font-non-standard");
  });

  it("defaults gradeScale to font-non-standard for a Boulder entry when the client omits it", async () => {
    const res = await post(validEntry());
    const { entry } = await res.json();
    expect(entry.gradeScale).toBe("font-non-standard");
  });

  it("defaults gradeScale to french for a Sport entry using the current low end when the client omits it", async () => {
    const res = await post({ ...validEntry(), type: "sport", grade: "6a", sportStyle: "lead" });
    const { entry } = await res.json();
    expect(entry.gradeScale).toBe("french");
  });

  it.each(["1", "1+", "2", "2+", "3", "3+"])(
    "defaults gradeScale to french-non-standard for a Sport entry at the legacy pre-correction low end (grade %s)",
    async grade => {
      const res = await post({ ...validEntry(), type: "sport", grade, sportStyle: "lead" });
      const { entry } = await res.json();
      expect(entry.gradeScale).toBe("french-non-standard");
    },
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

  it.each(["2026", "2026-07", "2026-07-30"])("accepts a %s date shape", async date => {
    const res = await post({ ...validEntry(), date });
    expect(res.status).toBe(201);
  });

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

  it("accepts a video link from a known video host, including its subdomains", async () => {
    for (const video of [
      "https://m.youtube.com/watch?v=abc",
      "https://youtu.be/abc",
      "https://vimeo.com/123",
      "https://www.instagram.com/reel/abc",
      "https://vm.tiktok.com/abc",
      "https://fb.watch/abc",
    ]) {
      const res = await post({ ...validEntry(), id: crypto.randomUUID(), video });
      expect(res.status, video).toBe(201);
      expect((await res.json()).entry.video).toBe(video);
    }
  });

  it("rejects a video link from any other host, look-alikes included", async () => {
    for (const video of [
      "https://example.com/clip",
      "https://youtube.com.evil.example/x",
      "https://notyoutube.com/x",
    ]) {
      const res = await post({ ...validEntry(), id: crypto.randomUUID(), video });
      expect(res.status, video).toBe(400);
      expect((await res.json()).error).toBe("video must be a link to YouTube, Vimeo, Instagram, TikTok or Facebook");
    }
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
    expect((await second.json()).entry.id).toBe("fixed-id-1");
    expect((await (await get()).json()).entries).toHaveLength(1);
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
    const { entry } = await recreated.json();
    expect(entry).toMatchObject({ id: "resurrect-id-1", name: "Resurrected" });

    const row = await env.LOGBOOK_DB.prepare(`SELECT deleted_at FROM entries WHERE id = ?`)
      .bind("resurrect-id-1")
      .first();
    expect(row.deleted_at).toBeNull();
  });

  it("a genuine idempotent replay of a still-live row is unaffected by the resurrect path", async () => {
    const entryWithId = { ...validEntry(), id: "still-live-id-1" };
    const first = await post(entryWithId);
    expect(first.status).toBe(201);

    const second = await post({ ...validEntry(), id: "still-live-id-1", name: "Should Not Apply" });
    expect(second.status).toBe(200);
    const { entry } = await second.json();
    expect(entry.name).toBe(entryWithId.name);
  });

  it("sets firstAttempt true only when status is send", async () => {
    const res = await post({ ...validEntry(), status: "send", firstAttempt: true });
    const { entry } = await res.json();
    expect(entry.firstAttempt).toBe(true);
  });

  it("forces firstAttempt false when status is not send, even if requested true", async () => {
    const res = await post({ ...validEntry(), status: "project", firstAttempt: true });
    const { entry } = await res.json();
    expect(entry.firstAttempt).toBe(false);
  });

  it("persists and returns sportStyle for a sport entry", async () => {
    const res = await post({ ...validEntry(), type: "sport", grade: "6a", sportStyle: "top_rope" });
    const { entry } = await res.json();
    expect(entry.sportStyle).toBe("top_rope");
  });

  it("rejects a sport entry with no sportStyle at all", async () => {
    const res = await post({ ...validEntry(), type: "sport", grade: "6a" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Missing required field: sportStyle");
  });

  it("null-coalesces omitted optional fields", async () => {
    const res = await post(validEntry());
    const { entry } = await res.json();
    expect(entry.date).toBeNull();
    expect(entry.video).toBeNull();
    expect(entry.notes).toBeNull();
  });

  it("gives each create a cursor above every existing one", async () => {
    await post({ ...validEntry(), id: "first" });
    await post({ ...validEntry(), id: "second" });
    const first = await env.LOGBOOK_DB.prepare(`SELECT sync_cursor FROM entries WHERE id = ?`).bind("first").first();
    const second = await env.LOGBOOK_DB.prepare(`SELECT sync_cursor FROM entries WHERE id = ?`).bind("second").first();
    expect(first.sync_cursor).toBeGreaterThan(0);
    expect(second.sync_cursor).toBe(first.sync_cursor + 1);
  });

  it("never lets a later write fall behind a cursor a device has already seen", async () => {
    await post({ ...validEntry(), id: "ahead" });
    const clockAhead = Date.now() + 60_000;
    await env.LOGBOOK_DB.prepare(`UPDATE entries SET sync_cursor = ? WHERE id = ?`).bind(clockAhead, "ahead").run();
    const pulled = await (await fetchJson(`${ENTRIES_URL}?since=0`, { headers: { Cookie: cookie } })).json();
    expect(pulled.cursor).toBe(clockAhead);

    await post({ ...validEntry(), id: "later" });

    const { entries } = await (
      await fetchJson(`${ENTRIES_URL}?since=${pulled.cursor}`, { headers: { Cookie: cookie } })
    ).json();
    expect(entries.map(e => e.id)).toContain("later");
  });
});

describe("handlePut", () => {
  it("rejects an unauthenticated request", async () => {
    const created = await (await post(validEntry())).json();
    const res = await jsonRequest("PUT", ENTRIES_URL, { ...validEntry(), id: created.entry.id, name: "Renamed" });
    expect(res.status).toBe(401);
  });

  it("updates an existing entry on the happy path", async () => {
    const created = await (await post(validEntry())).json();
    const id = created.entry.id;

    const res = await put({ ...validEntry(), id, name: "Renamed" });
    expect(res.status).toBe(200);
    const { entry } = await res.json();
    expect(entry.name).toBe("Renamed");
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
    const id = created.entry.id;

    const res = await put({ ...validEntry(), id, status: "flashed" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/^status must be one of/);
  });

  it("404s when the id belongs to a soft-deleted entry", async () => {
    const created = await (await post(validEntry())).json();
    const id = created.entry.id;
    await del(id);

    const res = await put({ ...validEntry(), id, name: "Renamed" });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("Entry not found");
  });

  it("bumps sync_cursor on a real edit", async () => {
    const created = await (await post(validEntry())).json();
    const id = created.entry.id;
    const before = await env.LOGBOOK_DB.prepare(`SELECT sync_cursor FROM entries WHERE id = ?`).bind(id).first();

    await put({ ...validEntry(), id, name: "Renamed" });

    const after = await env.LOGBOOK_DB.prepare(`SELECT sync_cursor FROM entries WHERE id = ?`).bind(id).first();
    expect(after.sync_cursor).toBeGreaterThan(before.sync_cursor);
  });
});

describe("handleDelete", () => {
  it("rejects an unauthenticated request", async () => {
    const created = await (await post(validEntry())).json();
    const res = await fetchJson(`${ENTRIES_URL}?id=${created.entry.id}`, { method: "DELETE" });
    expect(res.status).toBe(401);
  });

  it("deletes an existing entry on the happy path", async () => {
    const created = await (await post(validEntry())).json();
    const id = created.entry.id;

    const res = await del(id);
    expect(res.status).toBe(204);
    expect((await (await get()).json()).entries).toHaveLength(0);
  });

  it("rejects a missing id", async () => {
    const res = await del();
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Missing required field: id");
  });

  it("is idempotent when the id doesn't exist, rather than erroring (#268)", async () => {
    const res = await del("does-not-exist");
    expect(res.status).toBe(204);
  });

  it("idempotent delete leaves other entries untouched", async () => {
    const created = await (await post(validEntry())).json();
    const id = created.entry.id;

    const res = await del("does-not-exist");
    expect(res.status).toBe(204);
    const { entries } = await (await get()).json();
    expect(entries).toEqual([created.entry]);
    expect(entries.find(e => e.id === id)).toBeDefined();
  });

  it("soft-deletes -- the row still exists in D1, just excluded from reads", async () => {
    const created = await (await post(validEntry())).json();
    const id = created.entry.id;

    await del(id);

    const row = await env.LOGBOOK_DB.prepare(`SELECT deleted_at FROM entries WHERE id = ?`).bind(id).first();
    expect(row.deleted_at).not.toBeNull();
    expect(typeof row.deleted_at).toBe("number");
  });

  it("bumps sync_cursor on delete, same as a real change a future delta fetch needs to see", async () => {
    const created = await (await post(validEntry())).json();
    const id = created.entry.id;
    const before = await env.LOGBOOK_DB.prepare(`SELECT sync_cursor FROM entries WHERE id = ?`).bind(id).first();

    await del(id);

    const after = await env.LOGBOOK_DB.prepare(`SELECT sync_cursor, deleted_at FROM entries WHERE id = ?`)
      .bind(id)
      .first();
    expect(after.sync_cursor).toBeGreaterThan(before.sync_cursor);
    expect(after.deleted_at).not.toBeNull();
  });
});

function validMoveRow(overrides = {}) {
  return {
    difficulty: "hardest",
    limb: "hand",
    side: "left",
    holdType: "crimp",
    movementStyle: "static",
    wallAngle: "overhang",
    ...overrides,
  };
}
function validPainRow(overrides = {}) {
  return {
    limb: "foot",
    side: "right",
    holdType: "toe-hook",
    movementStyle: "dynamic",
    wallAngle: "slab",
    ...overrides,
  };
}

describe("entry_moves / entry_pain_moves", () => {
  it("defaults both to empty arrays when omitted", async () => {
    const created = await (await post(validEntry())).json();
    expect(created.entry.moves).toEqual([]);
    expect(created.entry.painMoves).toEqual([]);
  });

  it("writes and reads back moves on create", async () => {
    const created = await (await post({ ...validEntry(), moves: [validMoveRow()] })).json();
    expect(created.entry.moves).toHaveLength(1);
    expect(created.entry.moves[0]).toMatchObject({
      difficulty: "hardest",
      limb: "hand",
      side: "left",
      holdType: "crimp",
      movementStyle: "static",
      wallAngle: "overhang",
    });
    expect(typeof created.entry.moves[0].id).toBe("string");
  });

  it("writes and reads back painMoves on create", async () => {
    const created = await (await post({ ...validEntry(), painMoves: [validPainRow()] })).json();
    expect(created.entry.painMoves).toHaveLength(1);
    expect(created.entry.painMoves[0]).toMatchObject({
      limb: "foot",
      side: "right",
      holdType: "toe-hook",
      movementStyle: "dynamic",
      wallAngle: "slab",
    });
  });

  it("returns moves/painMoves for every entry via a plain GET", async () => {
    await post({ ...validEntry(), moves: [validMoveRow()] });
    const { entries } = await (await get()).json();
    expect(entries[0].moves).toHaveLength(1);
  });

  it("diffs-and-replaces moves on edit, not merges", async () => {
    const created = await (await post({ ...validEntry(), moves: [validMoveRow()] })).json();
    const updated = await (
      await put({
        ...created.entry,
        moves: [
          validMoveRow({
            difficulty: "easiest",
            limb: "knee",
            side: "left",
            holdType: "kneebar",
            movementStyle: "static",
          }),
        ],
      })
    ).json();
    expect(updated.entry.moves).toHaveLength(1);
    expect(updated.entry.moves[0].difficulty).toBe("easiest");
    expect(updated.entry.moves[0].limb).toBe("knee");
  });

  it("clears moves on edit when the new list is empty", async () => {
    const created = await (await post({ ...validEntry(), moves: [validMoveRow()] })).json();
    const updated = await (await put({ ...created.entry, moves: [] })).json();
    expect(updated.entry.moves).toEqual([]);
  });

  it("removes an entry's moves when it's deleted, keeping only the tombstone row (#1051)", async () => {
    const created = await (await post({ ...validEntry(), moves: [validMoveRow()] })).json();
    const id = created.entry.id;
    await del(id);
    const { results } = await env.LOGBOOK_DB.prepare("SELECT * FROM entry_moves WHERE entry_id = ?").bind(id).all();
    expect(results).toHaveLength(0);
  });

  it("rejects an invalid move row on create with a 400", async () => {
    const res = await post({ ...validEntry(), moves: [validMoveRow({ wallAngle: "ceiling" })] });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("moves[0].wallAngle must be one of: slab, vert, overhang, roof");
  });

  async function withFailingMoveInserts(fn) {
    await env.LOGBOOK_DB.prepare(
      "CREATE TRIGGER fail_moves BEFORE INSERT ON entry_moves BEGIN SELECT RAISE(ABORT, 'forced'); END",
    ).run();
    try {
      return await fn();
    } finally {
      await env.LOGBOOK_DB.prepare("DROP TRIGGER fail_moves").run();
    }
  }

  it("leaves an edited entry unchanged when writing its moves fails", async () => {
    const created = await (await post(validEntry())).json();
    const before = await env.LOGBOOK_DB.prepare("SELECT * FROM entries WHERE id = ?").bind(created.entry.id).first();

    const res = await withFailingMoveInserts(() => put({ ...created.entry, name: "Renamed", moves: [validMoveRow()] }));
    expect(res.status).toBe(500);

    const after = await env.LOGBOOK_DB.prepare("SELECT * FROM entries WHERE id = ?").bind(created.entry.id).first();
    expect(after).toEqual(before);
  });

  it("creates no entry when writing its moves fails", async () => {
    const res = await withFailingMoveInserts(() =>
      post({ ...validEntry(), id: "half-written", moves: [validMoveRow()] }),
    );
    expect(res.status).toBe(500);

    const row = await env.LOGBOOK_DB.prepare("SELECT id FROM entries WHERE id = ?").bind("half-written").first();
    expect(row).toBeNull();
  });

  it("a plain GET succeeds and returns every entry once entry count crosses the 100-bound-parameter chunk boundary", async () => {
    await env.LOGBOOK_DB.batch(
      Array.from({ length: 105 }, (_, i) =>
        buildInsertStatement(
          env,
          "entries",
          buildRow({ ...validEntry(), name: `Route ${i}` }, crypto.randomUUID(), userId),
        ),
      ),
    );

    const res = await get();
    expect(res.status).toBe(200);
    const { entries } = await res.json();
    expect(entries).toHaveLength(105);
    for (const entry of entries) {
      expect(entry.moves).toEqual([]);
      expect(entry.painMoves).toEqual([]);
    }
  });
});

describe("cross-user isolation", () => {
  it("a second user's own GET never sees the first user's entries", async () => {
    await post(validEntry());

    const userB = await createAuthedSession();
    const res = await get(userB.cookie);
    expect(await res.json()).toEqual({ entries: [] });
  });

  it("a second user creating with the first user's entry id gets a 409, and the entry is untouched", async () => {
    const created = await (await post(validEntry())).json();
    const id = created.entry.id;

    const userB = await createAuthedSession();
    const placeIdB = await seedPlace(userB.cookie);
    const res = await post({ ...validEntry(), placeId: placeIdB, id, name: "Hijacked" }, userB.cookie);
    expect(res.status).toBe(409);

    expect((await (await get()).json()).entries).toEqual([created.entry]);
    expect((await (await get(userB.cookie)).json()).entries).toEqual([]);
  });

  it("a second user cannot update the first user's entry by forging its id", async () => {
    const created = await (await post(validEntry())).json();
    const id = created.entry.id;

    const userB = await createAuthedSession();
    const placeIdB = await seedPlace(userB.cookie);
    const res = await put({ ...validEntry(), placeId: placeIdB, id, name: "Hijacked" }, userB.cookie);
    expect(res.status).toBe(404);

    const stillOwned = await (await get()).json();
    expect(stillOwned.entries[0].name).toBe("La Marie-Rose");
  });

  it("a second user's delete of a forged id doesn't remove the first user's entry", async () => {
    const created = await (await post(validEntry())).json();
    const id = created.entry.id;

    const userB = await createAuthedSession();
    const res = await del(id, userB.cookie);
    expect(res.status).toBe(204);

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
    const row = {
      id: "e1",
      name: "Test",
      grade: "6B",
      place_id: "p1",
      discipline_id: "boulder",
      status_id: "send",
      first_attempt: 0,
      date: "2026-01-01",
      video: null,
      notes: null,
      rpe: 80,
      attempts_to_send: 5,
    };
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
