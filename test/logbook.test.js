// Exercises server/api/logbook.js through the real Worker entrypoint (real
// routing + real D1 binding), not by importing validateFields/buildRow
// directly -- they're module-private, and testing through the public HTTP
// contract means these tests keep passing across any internal refactor
// that preserves behavior.
import { env } from "cloudflare:workers";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createAuthedSession, fetchJson, jsonRequest, resetAuthTables, seedPlace } from "./support.js";

const PUBLIC_URL = "/logbook/api/logbook";
const ADMIN_URL = "/logbook/api/admin/logbook";

// Beta gate (#296) is orthogonal to what this file tests -- disabled here
// the same way test/auth.test.js/test/email.test.js do, since
// createAuthedSession() doesn't supply an invite code.
beforeAll(() => { env.BETA_GATE_ENABLED = "false"; });
afterAll(() => { env.BETA_GATE_ENABLED = "true"; });

let cookie;
let placeId;
let locationId;

beforeEach(async () => {
  await resetAuthTables();
  ({ cookie } = await createAuthedSession());
  placeId = await seedPlace(cookie);
  locationId = await locationIdOf(placeId);
});

// #111 -- seedPlace() only ever returns placeId (its own established
// contract, many existing call sites across the suite depend on that
// exact shape) -- this looks up the locationId a seeded place actually
// belongs to via the real API, rather than widening seedPlace()'s own
// return shape for the sake of this one file's new tests.
async function locationIdOf(id, extraCookie = cookie) {
  const { places } = await (await fetchJson("/logbook/api/places", { headers: { Cookie: extraCookie } })).json();
  return places.find(p => p.id === id).locationId;
}

function get(extraCookie = cookie) {
  return fetchJson(PUBLIC_URL, { headers: { Cookie: extraCookie } });
}
function post(body, extraCookie = cookie) {
  return jsonRequest("POST", ADMIN_URL, body, { Cookie: extraCookie });
}
function put(body, extraCookie = cookie) {
  return jsonRequest("PUT", ADMIN_URL, body, { Cookie: extraCookie });
}
function del(id, extraCookie = cookie) {
  const path = id === undefined ? ADMIN_URL : `${ADMIN_URL}?id=${encodeURIComponent(id)}`;
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
  it("returns an empty entries array for an anonymous caller", async () => {
    const res = await fetchJson(PUBLIC_URL);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ entries: [] });
  });

  it("returns the logged-in caller's own entries", async () => {
    await post(validEntry());
    const res = await get();
    const { entries } = await res.json();
    expect(entries).toHaveLength(1);
    expect(entries[0].name).toBe("La Marie-Rose");
  });

  // #499 -- a soft-deleted entry stays a real row in D1, but the
  // "everything" endpoint (like every other read path) excludes it.
  it("excludes a soft-deleted entry", async () => {
    const created = await (await post(validEntry())).json();
    await del(created.entries[0].id);

    const { entries } = await (await get()).json();
    expect(entries).toEqual([]);
  });
});

// #498 -- /sync's own flat (not per-location) chunked fetch: opt-in via
// `limit` alone (no locationId), keeping the plain describe("handleGet")
// block above's "everything, no params" contract completely unchanged.
describe("handleGet (flat limit/offset, no locationId -- #498 chunked full sync)", () => {
  function getChunk(params, extraCookie = cookie) {
    const qs = new URLSearchParams(params).toString();
    return fetchJson(`${PUBLIC_URL}?${qs}`, { headers: { Cookie: extraCookie } });
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

  // total falls back to 0 here, not the real count -- COUNT(*) OVER()
  // can only be read off a row this query actually returns, and an
  // offset past the end returns none. Not a real problem for /sync's
  // own chunk loop (client/sync-main.js): it always stops as soon as a
  // chunk comes back shorter than requested, so it never issues a
  // request that overshoots the total in normal operation.
  it("offset past the end returns an empty (not error) chunk", async () => {
    await post(validEntry());
    const res = await getChunk({ limit: "20", offset: "50" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ entries: [], total: 0, cursor: 0 });
  });

  it("anonymous caller gets an empty chunk with a zero total, not an error", async () => {
    const res = await getChunk({ limit: "20" }, "");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ entries: [], total: 0, cursor: 0 });
  });

  it("cross-user isolation -- a chunk never includes another user's entries", async () => {
    await post(validEntry());
    const otherUser = await createAuthedSession();
    const res = await getChunk({ limit: "20" }, otherUser.cookie);
    expect(await res.json()).toEqual({ entries: [], total: 0, cursor: 0 });
  });

  // #500 -- the max sync_cursor across every matching row, independent of
  // this chunk's own LIMIT/OFFSET (same "whole matching set, not just this
  // page" reasoning as `total`) -- /sync's cold path (client/sync-main.js)
  // needs this to record entries' starting cursor for a future warm delta
  // fetch, without a separate request.
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

  // #499 -- excludes a soft-deleted entry, and its true total drops
  // accordingly (not just filtered out of the returned rows).
  it("excludes a soft-deleted entry from both the chunk and its total", async () => {
    const created = await (await post(validEntry())).json();
    await post({ ...validEntry(), name: "Still Here" });
    await del(created.entries[0].id);

    const { entries, total } = await (await getChunk({ limit: "20" })).json();
    expect(entries.map(e => e.name)).toEqual(["Still Here"]);
    expect(total).toBe(1);
  });
});

// #111 -- /log's own per-*table* (location) "Show more"/"Show all"
// follow-ups (Raven's own correction: pagination is per-table, and a
// table is one location, which can combine several places/areas under
// it -- not per-place). Doesn't touch the no-locationId "everything"
// contract above at all -- covered separately here so a regression in
// one can't hide behind the other's passing tests.
describe("handleGet (locationId -- #111 per-table pagination)", () => {
  function getLocation(id, params = {}, extraCookie = cookie) {
    const qs = new URLSearchParams({ locationId: id, ...params }).toString();
    return fetchJson(`${PUBLIC_URL}?${qs}`, { headers: { Cookie: extraCookie } });
  }

  it("returns only that location's entries, across every place under it", async () => {
    // A second place under the SAME location -- proves this aggregates
    // across places, not just one.
    const secondPlaceId = (await (await jsonRequest("POST", "/logbook/api/admin/places", { locationId, area: "Second Area" }, { Cookie: cookie })).json()).places.at(-1).id;
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

  // #499 -- excludes a soft-deleted entry from a per-location page too.
  it("excludes a soft-deleted entry", async () => {
    const created = await (await post(validEntry())).json();
    await del(created.entries[0].id);

    const { entries } = await (await getLocation(locationId)).json();
    expect(entries).toEqual([]);
  });

  it("returns an empty list for an anonymous caller, not an error", async () => {
    const res = await fetchJson(`${PUBLIC_URL}?locationId=${encodeURIComponent(locationId)}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ entries: [] });
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

// #500 -- `?since=<cursor>` switches /log's own GET to the delta-sync
// path: "everything changed since cursor X", including tombstoned
// deletes (via `deleted: true`), for /sync's warm-boot catch-up. A
// genuinely different contract from every describe block above (which
// all cover the "everything live" shapes) -- covered separately so a
// regression in one can't hide behind the other's passing tests.
describe("handleGet (?since= -- #500 delta sync)", () => {
  function getSince(since, extraCookie = cookie) {
    return fetchJson(`${PUBLIC_URL}?since=${since}`, { headers: { Cookie: extraCookie } });
  }
  function cursorOf(id) {
    return env.LOGBOOK_DB.prepare(`SELECT sync_cursor FROM entries WHERE id = ?`).bind(id).first().then(r => r.sync_cursor);
  }

  it("returns an empty delta and echoes back `since` as `cursor` for an anonymous caller", async () => {
    const res = await fetchJson(`${PUBLIC_URL}?since=0`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ entries: [], cursor: 0 });
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
    const res = await jsonRequest("POST", ADMIN_URL, validEntry());
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
    const res = await post({ ...validEntry(), type: "sport" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/^type must be one of/);
  });

  it("rejects a grade not valid for the entry's type", async () => {
    // "6a" is a valid *lead* grade, not a valid boulder grade
    const res = await post({ ...validEntry(), type: "boulder", grade: "6a" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/^grade must be one of/);
  });

  it("accepts a grade valid for the lead type", async () => {
    const res = await post({ ...validEntry(), type: "lead", grade: "6a" });
    expect(res.status).toBe(201);
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

  it("null-coalesces omitted optional fields", async () => {
    const res = await post(validEntry());
    const { entries } = await res.json();
    expect(entries[0].date).toBeNull();
    expect(entries[0].video).toBeNull();
    expect(entries[0].notes).toBeNull();
  });

  // #499 -- app-level Date.now(), not a column DEFAULT (D1 rejects a
  // non-constant DEFAULT on ALTER TABLE ADD COLUMN) -- confirms the real
  // insert path actually populates it, not just the migration's own
  // one-time backfill of pre-existing rows.
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
    const res = await jsonRequest("PUT", ADMIN_URL, { ...validEntry(), id: created.entries[0].id, name: "Renamed" });
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

  // #499 -- a soft-deleted entry is rejected as "not found," same as if
  // it never existed -- editing it should never resurrect it with new
  // field values.
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
    const res = await fetchJson(`${ADMIN_URL}?id=${created.entries[0].id}`, { method: "DELETE" });
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
    // Mirrors handlePost's duplicate-id idempotency -- the client's
    // offline queue replays a delete unconditionally now, including for
    // an entry that only ever existed as a queued, never-synced add.
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

  // #499 -- soft delete (a deleted_at tombstone), not a real DELETE, so a
  // future delta fetch (#500) can learn a row disappeared instead of a
  // deleted row just silently never showing up again with no record why.
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

// The one genuinely new security boundary #297 introduces -- no existing
// precedent to extend from. User A's entries must be completely invisible
// and unreachable to user B, even when B knows (or guesses/forges) A's
// real ids.
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

    // The original entry, read back by its real owner, is untouched.
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
