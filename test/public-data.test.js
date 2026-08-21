// #351 -- the read-only JSON data client/profile-main.js fetches for one
// target user's logbook/places/locations, at
// /logbook/api/public/:username/{logbook,places,locations}. Not
// hostname-gated (unlike test/public-profile.test.js's own shell route --
// see server/api/public-data.js's own comment on why), so exercised here
// against a plain https://example.com origin, same as every other
// /logbook/api/* test file.
import { env, exports } from "cloudflare:workers";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createAuthedSession, jsonRequest, resetAuthTables, seedPlace } from "./support.js";

beforeAll(() => { env.BETA_GATE_ENABLED = "false"; });
afterAll(() => { env.BETA_GATE_ENABLED = "true"; });

function fetchPublic(username, resource) {
  return exports.default.fetch(`https://example.com/logbook/api/public/${username}/${resource}`);
}

beforeEach(async () => {
  await resetAuthTables();
});

describe("public data API", () => {
  it("returns a public user's entries/places/locations without a session", async () => {
    const { cookie } = await createAuthedSession({ username: "publicdatauser" });
    const placeId = await seedPlace(cookie, { locationName: "Fontainebleau", country: "France", area: "Bas Cuvier" });
    await jsonRequest("POST", "/logbook/api/admin/logbook", { placeId, name: "Sleepwalker", grade: "7A", type: "boulder", status: "send" }, { Cookie: cookie });

    const entriesRes = await fetchPublic("publicdatauser", "logbook");
    expect(entriesRes.status).toBe(200);
    const { entries } = await entriesRes.json();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ name: "Sleepwalker", grade: "7A", type: "boulder" });

    const placesRes = await fetchPublic("publicdatauser", "places");
    expect((await placesRes.json()).places).toHaveLength(1);

    const locationsRes = await fetchPublic("publicdatauser", "locations");
    const { locations } = await locationsRes.json();
    expect(locations).toHaveLength(1);
    expect(locations[0]).toMatchObject({ name: "Fontainebleau", country: "France" });
  });

  it("returns an empty list, not an error, for a public user with no entries", async () => {
    await createAuthedSession({ username: "emptydatauser" });
    const res = await fetchPublic("emptydatauser", "logbook");
    expect(res.status).toBe(200);
    expect((await res.json()).entries).toEqual([]);
  });

  it("looks up the username case-insensitively, same as the profile page itself", async () => {
    await createAuthedSession({ username: "mixedcasedatauser" });
    const res = await fetchPublic("MixedCaseDataUser", "logbook");
    expect(res.status).toBe(200);
  });

  it("404s for a username that doesn't exist -- same anti-enumeration response the profile page uses", async () => {
    const res = await fetchPublic("nobody-by-this-name", "logbook");
    expect(res.status).toBe(404);
  });

  it("404s once logbook_public is turned off, same as the profile page itself", async () => {
    const { cookie } = await createAuthedSession({ username: "privatedatauser" });
    await jsonRequest("PATCH", "/logbook/api/admin/settings", {}, { Cookie: cookie }); // creates the settings row
    await env.LOGBOOK_DB.prepare(`UPDATE settings SET logbook_public = 0 WHERE user_id = (SELECT id FROM "user" WHERE username = 'privatedatauser')`).run();

    const res = await fetchPublic("privatedatauser", "logbook");
    expect(res.status).toBe(404);
  });

  it("#497 -- serves the map/counts aggregate for a public user, same anti-enumeration 404 for a private/nonexistent one", async () => {
    const { cookie } = await createAuthedSession({ username: "publicmapuser" });
    const placeId = await seedPlace(cookie, { locationName: "Fontainebleau", country: "France" });
    await jsonRequest("POST", "/logbook/api/admin/logbook", { placeId, name: "Sleepwalker", grade: "7A", type: "boulder", status: "send" }, { Cookie: cookie });

    const res = await fetchPublic("publicmapuser", "map/counts");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ France: { boulder: { total: 1, flash: 0, send: 1, project: 0 } } });

    const notFoundRes = await fetchPublic("nobody-by-this-name", "map/counts");
    expect(notFoundRes.status).toBe(404);
  });

  it("never leaks a different user's data for the same resource path", async () => {
    const { cookie: cookieA } = await createAuthedSession({ username: "userdataa" });
    const placeIdA = await seedPlace(cookieA);
    await jsonRequest("POST", "/logbook/api/admin/logbook", { placeId: placeIdA, name: "User A's Send", grade: "7A", type: "boulder", status: "send" }, { Cookie: cookieA });

    const { cookie: cookieB } = await createAuthedSession({ username: "userdatab" });
    const placeIdB = await seedPlace(cookieB);
    await jsonRequest("POST", "/logbook/api/admin/logbook", { placeId: placeIdB, name: "User B's Send", grade: "6A", type: "boulder", status: "send" }, { Cookie: cookieB });

    const { entries: entriesA } = await (await fetchPublic("userdataa", "logbook")).json();
    expect(entriesA.map(e => e.name)).toEqual(["User A's Send"]);

    const { entries: entriesB } = await (await fetchPublic("userdatab", "logbook")).json();
    expect(entriesB.map(e => e.name)).toEqual(["User B's Send"]);
  });
});
