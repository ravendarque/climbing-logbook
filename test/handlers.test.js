// Exercises places.js/locations.js/settings.js through the real Worker
// entrypoint, same rationale as logbook.test.js: the public HTTP contract
// is what's under test, not module internals.
import { env } from "cloudflare:workers";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createAuthedSession, fetchJson, jsonRequest, resetAuthTables } from "./support.js";

beforeAll(() => { env.BETA_GATE_ENABLED = "false"; });
afterAll(() => { env.BETA_GATE_ENABLED = "true"; });

let cookie;

beforeEach(async () => {
  await resetAuthTables();
  ({ cookie } = await createAuthedSession());
});

function getList(path, extraCookie) {
  return fetchJson(path, extraCookie ? { headers: { Cookie: extraCookie } } : undefined);
}
function postJson(path, body, extraCookie = cookie) {
  return jsonRequest("POST", path, body, { Cookie: extraCookie });
}
function patchJson(path, body, extraCookie = cookie) {
  return jsonRequest("PATCH", path, body, { Cookie: extraCookie });
}

// A real location, owned by the current `cookie`'s user -- places needs
// one to reference (#297's real ownership check, not just FK existence).
async function seedLocation(extraCookie = cookie) {
  const res = await postJson("/logbook/api/admin/locations", { name: "Magic Wood", country: "Switzerland" }, extraCookie);
  const { locations } = await res.json();
  return locations.at(-1).id;
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
    buildValidBody: locationId => ({ locationId, area: "Sector 1" }),
    buildMinimalBody: locationId => ({ locationId }),
    requiredField: "locationId",
    defaultField: "area",
    needsLocation: true,
  },
  {
    resource: "locations",
    listPath: "/logbook/api/locations",
    createPath: "/logbook/api/admin/locations",
    listKey: "locations",
    buildValidBody: () => ({ name: "Magic Wood", country: "Switzerland" }),
    buildMinimalBody: () => ({ name: "Magic Wood" }),
    requiredField: "name",
    defaultField: "country",
    needsLocation: false,
  },
])("$resource", ({ listPath, createPath, listKey, buildValidBody, buildMinimalBody, requiredField, defaultField, needsLocation }) => {
  async function validBody(extraCookie = cookie) {
    const locationId = needsLocation ? await seedLocation(extraCookie) : undefined;
    return buildValidBody(locationId);
  }
  async function minimalBody(extraCookie = cookie) {
    const locationId = needsLocation ? await seedLocation(extraCookie) : undefined;
    return buildMinimalBody(locationId);
  }

  it(`returns an empty ${listKey} array for an anonymous caller`, async () => {
    const res = await getList(listPath);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ [listKey]: [] });
  });

  it("rejects an unauthenticated create request", async () => {
    const res = await jsonRequest("POST", createPath, await validBody());
    expect(res.status).toBe(401);
  });

  it("creates on the happy path", async () => {
    const body = await validBody();
    const res = await postJson(createPath, body);
    expect(res.status).toBe(201);
    const responseBody = await res.json();
    expect(responseBody[listKey]).toHaveLength(1);
    expect(responseBody[listKey][0]).toMatchObject(body);
    expect(typeof responseBody[listKey][0].id).toBe("string");
    expect(responseBody[listKey][0].id.length).toBeGreaterThan(0);
  });

  it(`defaults ${defaultField} to an empty string when omitted`, async () => {
    const res = await postJson(createPath, await minimalBody());
    const body = await res.json();
    expect(body[listKey][0][defaultField]).toBe("");
  });

  it("rejects malformed JSON", async () => {
    const res = await postJson(createPath, "{not json");
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid JSON");
  });

  it(`rejects a missing ${requiredField}`, async () => {
    const body = await validBody();
    delete body[requiredField];
    const res = await postJson(createPath, body);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(`Missing required field: ${requiredField}`);
  });

  it("replays an existing id idempotently instead of erroring or duplicating", async () => {
    const withId = { ...(await validBody()), id: "fixed-id-1" };
    const first = await postJson(createPath, withId);
    expect(first.status).toBe(201);

    const second = await postJson(createPath, withId);
    expect(second.status).toBe(200);
    const body = await second.json();
    expect(body[listKey]).toHaveLength(1);
  });

  if (needsLocation) {
    it("rejects a locationId that doesn't exist", async () => {
      const res = await postJson(createPath, { locationId: "does-not-exist", area: "Sector 1" });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("locationId does not reference one of your locations");
    });
  }

  // #500 -- ?since= gets this shared factory's own delta path for free
  // (server/lib/d1-resource.js's createD1ResourceHandlers), covered here
  // once for both resources rather than hand-copied in a places-only and
  // locations-only file. Neither resource has a deleted_at column
  // (#159/#160 -- no delete capability yet), so unlike entries there's no
  // tombstone/`deleted` case to cover here.
  describe("?since= (#500 delta sync)", () => {
    function getSince(since, extraCookie = cookie) {
      return fetchJson(`${listPath}?since=${since}`, { headers: { Cookie: extraCookie } });
    }

    it("returns an empty delta and echoes since as cursor for an anonymous caller", async () => {
      const res = await fetchJson(`${listPath}?since=0`);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ [listKey]: [], cursor: 0 });
    });

    it("returns a row created at or after since, reporting its own cursor as the new cursor", async () => {
      const created = await (await postJson(createPath, await validBody())).json();
      const id = created[listKey][0].id;
      const row = await env.LOGBOOK_DB.prepare(`SELECT sync_cursor FROM ${listKey} WHERE id = ?`).bind(id).first();

      const { [listKey]: rows, cursor } = await (await getSince(row.sync_cursor)).json();
      expect(rows.map(r => r.id)).toEqual([id]);
      expect(cursor).toBe(row.sync_cursor);
    });

    it("excludes a row whose cursor is strictly before since", async () => {
      const created = await (await postJson(createPath, await validBody())).json();
      const id = created[listKey][0].id;
      const row = await env.LOGBOOK_DB.prepare(`SELECT sync_cursor FROM ${listKey} WHERE id = ?`).bind(id).first();

      const { [listKey]: rows } = await (await getSince(row.sync_cursor + 1)).json();
      expect(rows.find(r => r.id === id)).toBeUndefined();
    });

    it("never returns another user's rows (cross-user isolation)", async () => {
      await postJson(createPath, await validBody());
      const userB = await createAuthedSession();
      const res = await getSince(0, userB.cookie);
      expect(await res.json()).toEqual({ [listKey]: [], cursor: 0 });
    });
  });

  // The one genuinely new security boundary #297 introduces -- see
  // test/logbook.test.js's own "cross-user isolation" describe block for
  // the fuller rationale.
  describe("cross-user isolation", () => {
    it(`a second user's own GET never sees the first user's ${listKey}`, async () => {
      await postJson(createPath, await validBody());

      const userB = await createAuthedSession();
      const res = await getList(listPath, userB.cookie);
      expect(await res.json()).toEqual({ [listKey]: [] });
    });

    if (needsLocation) {
      it("a second user cannot create a place against the first user's location", async () => {
        const locationId = await seedLocation();
        const userB = await createAuthedSession();
        const res = await postJson(createPath, { locationId, area: "Sector 1" }, userB.cookie);
        expect(res.status).toBe(400);
        expect((await res.json()).error).toBe("locationId does not reference one of your locations");
      });
    }
  });
});

describe("settings", () => {
  it("returns default settings for an anonymous caller", async () => {
    const res = await fetchJson("/logbook/api/settings");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ athleteMode: false, activeDiscipline: "boulder", logbookPublic: true });
  });

  it("returns default settings for a logged-in user who's never set any", async () => {
    const res = await fetchJson("/logbook/api/settings", { headers: { Cookie: cookie } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ athleteMode: false, activeDiscipline: "boulder", logbookPublic: true });
  });

  it("rejects an unauthenticated update request", async () => {
    const res = await jsonRequest("PATCH", "/logbook/api/admin/settings", { athleteMode: true });
    expect(res.status).toBe(401);
  });

  it("updates athleteMode on the happy path", async () => {
    const res = await patchJson("/logbook/api/admin/settings", { athleteMode: true });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ athleteMode: true, activeDiscipline: "boulder", logbookPublic: true });
  });

  it("updates activeDiscipline on the happy path", async () => {
    const res = await patchJson("/logbook/api/admin/settings", { activeDiscipline: "lead" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ athleteMode: false, activeDiscipline: "lead", logbookPublic: true });
  });

  it("updates logbookPublic on the happy path", async () => {
    const res = await patchJson("/logbook/api/admin/settings", { logbookPublic: false });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ athleteMode: false, activeDiscipline: "boulder", logbookPublic: false });
  });

  it("merges a partial update onto existing settings instead of overwriting", async () => {
    await patchJson("/logbook/api/admin/settings", { athleteMode: true });
    const res = await patchJson("/logbook/api/admin/settings", { activeDiscipline: "lead" });
    expect(await res.json()).toEqual({ athleteMode: true, activeDiscipline: "lead", logbookPublic: true });
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

  it("rejects a non-boolean logbookPublic", async () => {
    const res = await patchJson("/logbook/api/admin/settings", { logbookPublic: "yes" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("logbookPublic must be a boolean");
  });

  it("a second user's settings are independent of the first user's", async () => {
    await patchJson("/logbook/api/admin/settings", { athleteMode: true });

    const userB = await createAuthedSession();
    const res = await fetchJson("/logbook/api/settings", { headers: { Cookie: userB.cookie } });
    expect(await res.json()).toEqual({ athleteMode: false, activeDiscipline: "boulder", logbookPublic: true });
  });
});
