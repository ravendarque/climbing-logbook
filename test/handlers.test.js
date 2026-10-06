import { env } from "cloudflare:workers";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createAuthedSession, fetchJson, jsonRequest, resetAuthTables } from "./support.js";

beforeAll(() => {
  env.BETA_GATE_ENABLED = "false";
});
afterAll(() => {
  env.BETA_GATE_ENABLED = "true";
});

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

async function seedLocation(extraCookie = cookie, name = "Magic Wood") {
  const res = await postJson("/-/api/locations", { name, country: "Switzerland" }, extraCookie);
  return (await res.json()).location.id;
}

describe.each([
  {
    resource: "places",
    listPath: "/-/api/places",
    createPath: "/-/api/places",
    listKey: "places",
    rowKey: "place",
    buildValidBody: locationId => ({ locationId, area: "Sector 1" }),
    buildMinimalBody: locationId => ({ locationId }),
    requiredField: "locationId",
    defaultField: "area",
    dedupField: "area",
    needsLocation: true,
  },
  {
    resource: "locations",
    listPath: "/-/api/locations",
    createPath: "/-/api/locations",
    listKey: "locations",
    rowKey: "location",
    buildValidBody: () => ({ name: "Magic Wood", country: "Switzerland" }),
    buildMinimalBody: () => ({ name: "Magic Wood" }),
    requiredField: "name",
    defaultField: "country",
    dedupField: "name",
    needsLocation: false,
  },
])(
  "$resource",
  ({
    listPath,
    createPath,
    listKey,
    rowKey,
    buildValidBody,
    buildMinimalBody,
    requiredField,
    defaultField,
    dedupField,
    needsLocation,
  }) => {
    async function validBody(extraCookie = cookie) {
      const locationId = needsLocation ? await seedLocation(extraCookie) : undefined;
      return buildValidBody(locationId);
    }
    async function minimalBody(extraCookie = cookie) {
      const locationId = needsLocation ? await seedLocation(extraCookie) : undefined;
      return buildMinimalBody(locationId);
    }

    it("401s an anonymous read (#992)", async () => {
      const res = await getList(listPath);
      expect(res.status).toBe(401);
    });

    it("rejects an unauthenticated create request", async () => {
      const res = await jsonRequest("POST", createPath, await validBody());
      expect(res.status).toBe(401);
    });

    it("creates on the happy path", async () => {
      const body = await validBody();
      const res = await postJson(createPath, body);
      expect(res.status).toBe(201);
      const { [rowKey]: row } = await res.json();
      expect(row).toMatchObject(body);
      expect(typeof row.id).toBe("string");
      expect(row.id.length).toBeGreaterThan(0);
    });

    it(`defaults ${defaultField} to an empty string when omitted`, async () => {
      const res = await postJson(createPath, await minimalBody());
      const body = await res.json();
      expect(body[rowKey][defaultField]).toBe("");
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
      expect((await second.json())[rowKey].id).toBe("fixed-id-1");
      expect((await (await getList(listPath, cookie)).json())[listKey]).toHaveLength(1);
    });

    it("409s an id another user already holds", async () => {
      const { cookie: otherCookie } = await createAuthedSession();
      const otherBody = { ...(await validBody(otherCookie)), id: "fixed-id-cross-user" };
      const first = await postJson(createPath, otherBody, otherCookie);
      expect(first.status).toBe(201);

      const ownBody = { ...(await validBody()), id: "fixed-id-cross-user" };
      const second = await postJson(createPath, ownBody, cookie);
      expect(second.status).toBe(409);
      expect((await (await getList(listPath, otherCookie)).json())[listKey]).toEqual([
        expect.objectContaining(otherBody),
      ]);
      expect((await (await getList(listPath, cookie)).json())[listKey].map(r => r.id)).not.toContain(
        "fixed-id-cross-user",
      );
    });

    if (needsLocation) {
      it("rejects a locationId that doesn't exist", async () => {
        const res = await postJson(createPath, { locationId: "does-not-exist", area: "Sector 1" });
        expect(res.status).toBe(400);
        expect((await res.json()).error).toBe("locationId does not reference one of your locations");
      });
    }

    it.each([
      ["id", { x: 1 }, "id must be a string"],
      ["id", "not a valid id!", "id must be 1 to 64 letters, digits, - or _"],
      [defaultField, { x: 1 }, `${defaultField} must be a string`],
      [requiredField, 42, `${requiredField} must be a string`],
    ])("400s %s = %j instead of letting it reach D1", async (field, value, message) => {
      const res = await postJson(createPath, { ...(await validBody()), [field]: value });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe(message);
    });

    it("400s a body that isn't an object", async () => {
      const res = await postJson(createPath, null);
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("Request body must be a JSON object");
    });

    describe("?since= (#500 delta sync)", () => {
      function getSince(since, extraCookie = cookie) {
        return fetchJson(`${listPath}?since=${since}`, { headers: { Cookie: extraCookie } });
      }

      it("401s an anonymous caller (#992)", async () => {
        const res = await fetchJson(`${listPath}?since=0`);
        expect(res.status).toBe(401);
      });

      it.each(["-1", "abc", "", "1.5"])("400s since=%j", async since => {
        const res = await getSince(since);
        expect(res.status).toBe(400);
        expect((await res.json()).error).toMatch(/^since must be a whole number/);
      });

      it("returns a row created at or after since, reporting its own cursor as the new cursor", async () => {
        const created = await (await postJson(createPath, await validBody())).json();
        const id = created[rowKey].id;
        const row = await env.LOGBOOK_DB.prepare(`SELECT sync_cursor FROM ${listKey} WHERE id = ?`).bind(id).first();

        const { [listKey]: rows, cursor } = await (await getSince(row.sync_cursor)).json();
        expect(rows.map(r => r.id)).toEqual([id]);
        expect(cursor).toBe(row.sync_cursor);
      });

      it("excludes a row whose cursor is strictly before since", async () => {
        const created = await (await postJson(createPath, await validBody())).json();
        const id = created[rowKey].id;
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

    describe("dedup-on-write (#490)", () => {
      it("a second create matching an existing row's name (case-insensitively) reuses it instead of duplicating", async () => {
        const locationId = needsLocation ? await seedLocation() : undefined;
        const first = await postJson(createPath, buildValidBody(locationId));
        expect(first.status).toBe(201);
        const originalId = (await first.json())[rowKey].id;

        const dup = buildValidBody(locationId);
        dup[dedupField] = dup[dedupField].toUpperCase();
        const second = await postJson(createPath, dup);
        expect(second.status).toBe(200);
        const secondBody = await second.json();
        expect(secondBody.dedupedTo).toBe(originalId);
        expect(secondBody[rowKey].id).toBe(originalId);
      });

      it("does not dedup against another user's matching row", async () => {
        const locationId = needsLocation ? await seedLocation() : undefined;
        await postJson(createPath, buildValidBody(locationId));

        const userB = await createAuthedSession();
        const locationIdB = needsLocation ? await seedLocation(userB.cookie) : undefined;
        const res = await postJson(createPath, buildValidBody(locationIdB), userB.cookie);
        expect(res.status).toBe(201);
        expect((await res.json()).dedupedTo).toBeUndefined();
      });

      if (needsLocation) {
        it("does not dedup places with the same area name under a different location", async () => {
          const locationIdA = await seedLocation(cookie, "Magic Wood");
          await postJson(createPath, buildValidBody(locationIdA));

          const locationIdB = await seedLocation(cookie, "Fontainebleau");
          const res = await postJson(createPath, buildValidBody(locationIdB));
          expect(res.status).toBe(201);
          expect((await res.json()).dedupedTo).toBeUndefined();
        });
      }
    });

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
  },
);

describe("locations name validation", () => {
  it("rejects a non-string name with a 400, not an unhandled error", async () => {
    const res = await jsonRequest("POST", "/-/api/locations", { name: { x: 1 } }, { Cookie: cookie });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("name must be a string");
  });
});

describe("settings", () => {
  it("401s an anonymous caller (#992)", async () => {
    const res = await fetchJson("/-/api/settings");
    expect(res.status).toBe(401);
  });

  it("returns default settings for a logged-in user who's never set any", async () => {
    const res = await fetchJson("/-/api/settings", { headers: { Cookie: cookie } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      athleteMode: false,
      activeDiscipline: "boulder",
      logbookPublic: true,
      betaOptIn: false,
      onboardingCompleted: false,
    });
  });

  it("rejects an unauthenticated read of the admin settings", async () => {
    const res = await fetchJson("/-/api/settings");
    expect(res.status).toBe(401);
  });

  it("reads the caller's own settings from the admin path", async () => {
    await patchJson("/-/api/settings", { betaOptIn: true });
    const res = await fetchJson("/-/api/settings", { headers: { Cookie: cookie } });
    expect(res.status).toBe(200);
    expect((await res.json()).betaOptIn).toBe(true);
  });

  it("treats a NULL beta_opt_in (row created without it) as not enrolled", async () => {
    await patchJson("/-/api/settings", { athleteMode: true });
    const res = await fetchJson("/-/api/settings", { headers: { Cookie: cookie } });
    expect((await res.json()).betaOptIn).toBe(false);
  });

  it("rejects an unauthenticated update request", async () => {
    const res = await jsonRequest("PATCH", "/-/api/settings", { athleteMode: true });
    expect(res.status).toBe(401);
  });

  it("updates athleteMode on the happy path", async () => {
    const res = await patchJson("/-/api/settings", { athleteMode: true });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      athleteMode: true,
      activeDiscipline: "boulder",
      logbookPublic: true,
      betaOptIn: false,
      onboardingCompleted: false,
    });
  });

  it("updates activeDiscipline on the happy path", async () => {
    const res = await patchJson("/-/api/settings", { activeDiscipline: "sport" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      athleteMode: false,
      activeDiscipline: "sport",
      logbookPublic: true,
      betaOptIn: false,
      onboardingCompleted: false,
    });
  });

  it("updates logbookPublic on the happy path", async () => {
    const res = await patchJson("/-/api/settings", { logbookPublic: false });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      athleteMode: false,
      activeDiscipline: "boulder",
      logbookPublic: false,
      betaOptIn: false,
      onboardingCompleted: false,
    });
  });

  it("merges a partial update onto existing settings instead of overwriting", async () => {
    await patchJson("/-/api/settings", { athleteMode: true });
    const res = await patchJson("/-/api/settings", { activeDiscipline: "sport" });
    expect(await res.json()).toEqual({
      athleteMode: true,
      activeDiscipline: "sport",
      logbookPublic: true,
      betaOptIn: false,
      onboardingCompleted: false,
    });
  });

  it("rejects malformed JSON", async () => {
    const res = await patchJson("/-/api/settings", "{not json");
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid JSON");
  });

  it.each([null, 42, "a string", [1, 2, 3]])("rejects a non-object JSON body (%j)", async body => {
    const res = await patchJson("/-/api/settings", JSON.stringify(body));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid JSON");
  });

  it("marks onboarding completed", async () => {
    const res = await patchJson("/-/api/settings", { onboardingCompleted: true });
    expect(res.status).toBe(200);
    expect((await res.json()).onboardingCompleted).toBe(true);
    const read = await fetchJson("/-/api/settings", { headers: { Cookie: cookie } });
    expect((await read.json()).onboardingCompleted).toBe(true);
  });

  it("only ever sets onboardingCompleted to true", async () => {
    for (const value of ["yes", false]) {
      const res = await patchJson("/-/api/settings", { onboardingCompleted: value });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("onboardingCompleted can only be set to true");
    }
  });

  it("rejects a non-boolean athleteMode", async () => {
    const res = await patchJson("/-/api/settings", { athleteMode: "yes" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("athleteMode must be a boolean");
  });

  it("rejects an activeDiscipline outside boulder/sport", async () => {
    const res = await patchJson("/-/api/settings", { activeDiscipline: "trad" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("activeDiscipline must be one of: boulder, sport");
  });

  it("accepts an activeDiscipline of sport", async () => {
    const res = await patchJson("/-/api/settings", { activeDiscipline: "sport" });
    expect(res.status).toBe(200);
  });

  it("rejects a non-boolean logbookPublic", async () => {
    const res = await patchJson("/-/api/settings", { logbookPublic: "yes" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("logbookPublic must be a boolean");
  });

  it("updates betaOptIn to true on the happy path", async () => {
    const res = await patchJson("/-/api/settings", { betaOptIn: true });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      athleteMode: false,
      activeDiscipline: "boulder",
      logbookPublic: true,
      betaOptIn: true,
      onboardingCompleted: false,
    });
  });

  it("updates betaOptIn to false on the happy path", async () => {
    const res = await patchJson("/-/api/settings", { betaOptIn: false });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      athleteMode: false,
      activeDiscipline: "boulder",
      logbookPublic: true,
      betaOptIn: false,
      onboardingCompleted: false,
    });
  });

  it("rejects a non-boolean betaOptIn", async () => {
    const res = await patchJson("/-/api/settings", { betaOptIn: "yes" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("betaOptIn must be a boolean");
  });

  it("a second user's settings are independent of the first user's", async () => {
    await patchJson("/-/api/settings", { athleteMode: true });

    const userB = await createAuthedSession();
    const res = await fetchJson("/-/api/settings", { headers: { Cookie: userB.cookie } });
    expect(await res.json()).toEqual({
      athleteMode: false,
      activeDiscipline: "boulder",
      logbookPublic: true,
      betaOptIn: false,
      onboardingCompleted: false,
    });
  });
});
