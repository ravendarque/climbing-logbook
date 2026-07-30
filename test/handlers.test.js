// Exercises places.js/locations.js/settings.js/admin-session.js/admin-login.js
// through the real Worker entrypoint, same rationale as logbook.test.js:
// the public HTTP contract is what's under test, not module internals.
import { beforeEach, describe, expect, it } from "vitest";
import { fetchJson, jsonRequest, resetKv } from "./support.js";

beforeEach(resetKv);

function postJson(path, body) {
  return jsonRequest("POST", path, body);
}
function patchJson(path, body) {
  return jsonRequest("PATCH", path, body);
}

// places and locations are structurally identical resources (create + list,
// one required field, one optional field defaulting to "", idempotent
// create-by-id) -- a single parameterized suite covers both instead of two
// hand-copied describe blocks that can silently drift apart.
describe.each([
  {
    resource: "places",
    listPath: "/logbook/api/places",
    createPath: "/logbook/api/admin/places",
    listKey: "places",
    validBody: { locationId: "loc-1", area: "Sector 1" },
    minimalBody: { locationId: "loc-1" },
    requiredField: "locationId",
    defaultField: "area",
  },
  {
    resource: "locations",
    listPath: "/logbook/api/locations",
    createPath: "/logbook/api/admin/locations",
    listKey: "locations",
    validBody: { name: "Magic Wood", country: "Switzerland" },
    minimalBody: { name: "Magic Wood" },
    requiredField: "name",
    defaultField: "country",
  },
])("$resource", ({ listPath, createPath, listKey, validBody, minimalBody, requiredField, defaultField }) => {
  it(`returns an empty ${listKey} array when KV is unset`, async () => {
    const res = await fetchJson(listPath);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ [listKey]: [] });
  });

  it("creates on the happy path", async () => {
    const res = await postJson(createPath, validBody);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body[listKey]).toHaveLength(1);
    expect(body[listKey][0]).toMatchObject(validBody);
    expect(typeof body[listKey][0].id).toBe("string");
    expect(body[listKey][0].id.length).toBeGreaterThan(0);
  });

  it(`defaults ${defaultField} to an empty string when omitted`, async () => {
    const res = await postJson(createPath, minimalBody);
    const body = await res.json();
    expect(body[listKey][0][defaultField]).toBe("");
  });

  it("rejects malformed JSON", async () => {
    const res = await postJson(createPath, "{not json");
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid JSON");
  });

  it(`rejects a missing ${requiredField}`, async () => {
    const body = { ...validBody };
    delete body[requiredField];
    const res = await postJson(createPath, body);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(`Missing required field: ${requiredField}`);
  });

  it("replays an existing id idempotently instead of erroring or duplicating", async () => {
    const withId = { ...validBody, id: "fixed-id-1" };
    const first = await postJson(createPath, withId);
    expect(first.status).toBe(201);

    const second = await postJson(createPath, withId);
    expect(second.status).toBe(200);
    const body = await second.json();
    expect(body[listKey]).toHaveLength(1);
  });
});

describe("settings", () => {
  it("returns default settings when KV is unset", async () => {
    const res = await fetchJson("/logbook/api/settings");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ athleteMode: false, activeDiscipline: "boulder" });
  });

  it("updates athleteMode on the happy path", async () => {
    const res = await patchJson("/logbook/api/admin/settings", { athleteMode: true });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ athleteMode: true, activeDiscipline: "boulder" });
  });

  it("updates activeDiscipline on the happy path", async () => {
    const res = await patchJson("/logbook/api/admin/settings", { activeDiscipline: "lead" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ athleteMode: false, activeDiscipline: "lead" });
  });

  it("merges a partial update onto existing settings instead of overwriting", async () => {
    await patchJson("/logbook/api/admin/settings", { athleteMode: true });
    const res = await patchJson("/logbook/api/admin/settings", { activeDiscipline: "lead" });
    expect(await res.json()).toEqual({ athleteMode: true, activeDiscipline: "lead" });
  });

  it("rejects malformed JSON", async () => {
    const res = await patchJson("/logbook/api/admin/settings", "{not json");
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid JSON");
  });

  it.each([null, 42, "a string", [1, 2, 3]])(
    "rejects a non-object JSON body (%j)",
    async (body) => {
      const res = await patchJson("/logbook/api/admin/settings", JSON.stringify(body));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("Invalid JSON");
    }
  );

  it("rejects a non-boolean athleteMode", async () => {
    const res = await patchJson("/logbook/api/admin/settings", { athleteMode: "yes" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("athleteMode must be a boolean");
  });

  it("rejects an activeDiscipline outside boulder/lead", async () => {
    const res = await patchJson("/logbook/api/admin/settings", { activeDiscipline: "sport" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("activeDiscipline must be 'boulder' or 'lead'");
  });
});

describe("admin-session", () => {
  it("echoes the Access-authenticated user's email", async () => {
    const res = await fetchJson("/logbook/api/admin/session", {
      headers: { "Cf-Access-Authenticated-User-Email": "nix@ravendarque.com" },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ loggedIn: true, email: "nix@ravendarque.com" });
  });

  it("returns a null email when the header is absent", async () => {
    const res = await fetchJson("/logbook/api/admin/session");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ loggedIn: true, email: null });
  });
});

describe("admin-login", () => {
  it("redirects to the app", async () => {
    const res = await fetchJson("/logbook/api/admin/login", { redirect: "manual" });
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("https://ravendarque.com/logbook/");
  });
});
