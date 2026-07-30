// Exercises src/api/logbook.js through the real Worker entrypoint (real
// routing + real KV binding), not by importing validateFields/buildEntry
// directly -- they're module-private, and testing through the public HTTP
// contract means these tests keep passing across any internal refactor
// that preserves behavior. KV storage is NOT isolated per-test within a
// file (confirmed empirically -- entries accumulated across `it` blocks
// until this reset was added), so every test starts from a clean slate
// via beforeEach instead of relying on execution order.
import { beforeEach, describe, expect, it } from "vitest";
import { fetchJson, jsonRequest, resetKv } from "./support.js";

beforeEach(resetKv);

const PUBLIC_URL = "/logbook/api/logbook";
const ADMIN_URL = "/logbook/api/admin/logbook";

function get() {
  return fetchJson(PUBLIC_URL);
}
function post(body) {
  return jsonRequest("POST", ADMIN_URL, body);
}
function put(body) {
  return jsonRequest("PUT", ADMIN_URL, body);
}
function del(id) {
  const path = id === undefined ? ADMIN_URL : `${ADMIN_URL}?id=${encodeURIComponent(id)}`;
  return fetchJson(path, { method: "DELETE" });
}

const VALID_ENTRY = {
  name: "La Marie-Rose",
  grade: "6B",
  placeId: "place-1",
  type: "boulder",
  status: "send",
};

describe("handleGet", () => {
  it("returns an empty entries array when KV is unset", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ entries: [] });
  });

  it("returns entries after one has been created", async () => {
    await post(VALID_ENTRY);
    const res = await get();
    const { entries } = await res.json();
    expect(entries).toHaveLength(1);
    expect(entries[0].name).toBe("La Marie-Rose");
  });
});

describe("handlePost", () => {
  it("creates an entry on the happy path", async () => {
    const res = await post(VALID_ENTRY);
    expect(res.status).toBe(201);
    const { entries } = await res.json();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      name: "La Marie-Rose",
      grade: "6B",
      placeId: "place-1",
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
      const entry = { ...VALID_ENTRY };
      delete entry[field];
      const res = await post(entry);
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe(`Missing required field: ${field}`);
    }
  );

  it("rejects an invalid type", async () => {
    const res = await post({ ...VALID_ENTRY, type: "sport" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/^type must be one of/);
  });

  it("rejects a grade not valid for the entry's type", async () => {
    // "6a" is a valid *lead* grade, not a valid boulder grade
    const res = await post({ ...VALID_ENTRY, type: "boulder", grade: "6a" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/^grade must be one of/);
  });

  it("accepts a grade valid for the lead type", async () => {
    const res = await post({ ...VALID_ENTRY, type: "lead", grade: "6a" });
    expect(res.status).toBe(201);
  });

  it("rejects an invalid status", async () => {
    const res = await post({ ...VALID_ENTRY, status: "flashed" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/^status must be one of/);
  });

  it.each(["2026", "2026-07", "2026-07-30"])(
    "accepts a %s date shape",
    async (date) => {
      const res = await post({ ...VALID_ENTRY, date });
      expect(res.status).toBe(201);
    }
  );

  it("rejects a malformed date shape", async () => {
    const res = await post({ ...VALID_ENTRY, date: "30-07-2026" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("date must be YYYY, YYYY-MM, or YYYY-MM-DD");
  });

  it("rejects a non-http(s) video URL", async () => {
    const res = await post({ ...VALID_ENTRY, video: "ftp://example.com/clip" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("video must be an http(s) URL");
  });

  it("rejects an unparseable video URL", async () => {
    const res = await post({ ...VALID_ENTRY, video: "not a url" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("video must be a valid URL");
  });

  it("accepts a valid https video URL", async () => {
    const res = await post({ ...VALID_ENTRY, video: "https://example.com/clip" });
    expect(res.status).toBe(201);
    const { entries } = await res.json();
    expect(entries[0].video).toBe("https://example.com/clip");
  });

  it("replays an existing id idempotently instead of erroring or duplicating", async () => {
    const entryWithId = { ...VALID_ENTRY, id: "fixed-id-1" };
    const first = await post(entryWithId);
    expect(first.status).toBe(201);

    const second = await post(entryWithId);
    expect(second.status).toBe(200);
    const { entries } = await second.json();
    expect(entries).toHaveLength(1);
  });

  it("sets firstAttempt true only when status is send", async () => {
    const res = await post({ ...VALID_ENTRY, status: "send", firstAttempt: true });
    const { entries } = await res.json();
    expect(entries[0].firstAttempt).toBe(true);
  });

  it("forces firstAttempt false when status is not send, even if requested true", async () => {
    const res = await post({ ...VALID_ENTRY, status: "project", firstAttempt: true });
    const { entries } = await res.json();
    expect(entries[0].firstAttempt).toBe(false);
  });

  it("null-coalesces omitted optional fields", async () => {
    const res = await post(VALID_ENTRY);
    const { entries } = await res.json();
    expect(entries[0].date).toBeNull();
    expect(entries[0].video).toBeNull();
    expect(entries[0].notes).toBeNull();
  });
});

describe("handlePut", () => {
  it("updates an existing entry on the happy path", async () => {
    const created = await (await post(VALID_ENTRY)).json();
    const id = created.entries[0].id;

    const res = await put({ ...VALID_ENTRY, id, name: "Renamed" });
    expect(res.status).toBe(200);
    const { entries } = await res.json();
    expect(entries[0].name).toBe("Renamed");
  });

  it("rejects a missing id", async () => {
    const res = await put(VALID_ENTRY);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Missing required field: id");
  });

  it("404s when the id doesn't exist", async () => {
    const res = await put({ ...VALID_ENTRY, id: "does-not-exist" });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("Entry not found");
  });

  it("passes through validation errors", async () => {
    const created = await (await post(VALID_ENTRY)).json();
    const id = created.entries[0].id;

    const res = await put({ ...VALID_ENTRY, id, status: "flashed" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/^status must be one of/);
  });
});

describe("handleDelete", () => {
  it("deletes an existing entry on the happy path", async () => {
    const created = await (await post(VALID_ENTRY)).json();
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

  it("404s when the id doesn't exist", async () => {
    const res = await del("does-not-exist");
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("Entry not found");
  });
});
