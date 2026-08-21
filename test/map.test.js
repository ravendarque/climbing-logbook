// Exercises server/api/map.js through the real Worker entrypoint (real
// routing + real D1 binding) -- proves the join/aggregation query itself
// (country x discipline x status, flash vs. plain send derived from
// first_attempt) against real seeded rows, plus cross-user isolation.
import { env } from "cloudflare:workers";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createAuthedSession, fetchJson, jsonRequest, resetAuthTables, seedPlace } from "./support.js";

const MAP_COUNTS_URL = "/logbook/api/map/counts";
const ADMIN_ENTRY_URL = "/logbook/api/admin/logbook";

beforeAll(() => { env.BETA_GATE_ENABLED = "false"; });
afterAll(() => { env.BETA_GATE_ENABLED = "true"; });

let cookie;

beforeEach(async () => {
  await resetAuthTables();
  ({ cookie } = await createAuthedSession());
});

function get(extraCookie = cookie) {
  return fetchJson(MAP_COUNTS_URL, { headers: { Cookie: extraCookie } });
}
function postEntry(placeId, overrides = {}, extraCookie = cookie) {
  return jsonRequest("POST", ADMIN_ENTRY_URL, {
    name: "La Marie-Rose", grade: "6B", placeId, type: "boulder", status: "send",
    ...overrides,
  }, { Cookie: extraCookie });
}

describe("handleGetMapCounts", () => {
  it("returns an empty object for an anonymous caller", async () => {
    const res = await fetchJson(MAP_COUNTS_URL);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
  });

  it("groups by country and discipline, splitting flash from a plain send", async () => {
    const placeId = await seedPlace(cookie, { country: "France" });
    await postEntry(placeId, { type: "boulder", status: "send", firstAttempt: true });
    await postEntry(placeId, { type: "boulder", status: "send", firstAttempt: false });
    await postEntry(placeId, { type: "boulder", status: "project" });
    await postEntry(placeId, { type: "lead", grade: "6a", status: "send", firstAttempt: true });

    const counts = await (await get()).json();
    expect(counts.France.boulder).toEqual({ total: 3, flash: 1, send: 1, project: 1 });
    expect(counts.France.lead).toEqual({ total: 1, flash: 1, send: 0, project: 0 });
  });

  it("total counts every entry regardless of status -- a pin needs to show even for a location with only archived/checkout entries", async () => {
    const placeId = await seedPlace(cookie, { country: "France" });
    await postEntry(placeId, { type: "boulder", status: "checkout" });
    await postEntry(placeId, { type: "boulder", status: "archived" });

    const counts = await (await get()).json();
    expect(counts.France.boulder).toEqual({ total: 2, flash: 0, send: 0, project: 0 });
  });

  it("keeps two different countries as separate keys", async () => {
    const franceId = await seedPlace(cookie, { country: "France" });
    const ukId = await seedPlace(cookie, { locationName: "Portland", country: "United Kingdom" });
    await postEntry(franceId);
    await postEntry(ukId);

    const counts = await (await get()).json();
    expect(Object.keys(counts).sort()).toEqual(["France", "United Kingdom"]);
  });

  it("sets Cache-Control: no-store, same as every other GET here", async () => {
    const res = await get();
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("a second user's own request never reflects the first user's entries", async () => {
    const placeId = await seedPlace(cookie, { country: "France" });
    await postEntry(placeId);

    const userB = await createAuthedSession();
    const res = await get(userB.cookie);
    expect(await res.json()).toEqual({});
  });
});
