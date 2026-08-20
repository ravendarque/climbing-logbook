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

beforeEach(async () => {
  await resetAuthTables();
  ({ cookie } = await createAuthedSession());
  placeId = await seedPlace(cookie);
});

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
