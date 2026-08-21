// Exercises server/api/performance.js through the real Worker entrypoint
// (real routing + real D1 binding) -- proves the HTTP wiring (auth
// resolution, both disciplines in one response, cross-user isolation).
// The pyramid math itself (send-counting, 8-4-2-1 promotion) is already
// thoroughly covered directly against the pure functions in
// test/shared/pyramid-stats.test.js -- not re-verified exhaustively here.
import { env } from "cloudflare:workers";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createAuthedSession, fetchJson, jsonRequest, resetAuthTables, seedPlace } from "./support.js";

const PYRAMID_URL = "/logbook/api/performance/pyramid";
const ADMIN_ENTRY_URL = "/logbook/api/admin/logbook";

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
  return fetchJson(PYRAMID_URL, { headers: { Cookie: extraCookie } });
}
function postEntry(overrides = {}, extraCookie = cookie) {
  return jsonRequest("POST", ADMIN_ENTRY_URL, {
    name: "La Marie-Rose", grade: "6B", placeId, type: "boulder", status: "send",
    date: "2026-06-01", // within 12 months of #currentDate (2026-08-21)
    ...overrides,
  }, { Cookie: extraCookie });
}

describe("handleGetPyramid", () => {
  it("returns empty pyramids for an anonymous caller", async () => {
    const res = await fetchJson(PYRAMID_URL);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      boulder: { top4: [], lower: [], hasSends: false, promotedGrade: null },
      lead: { top4: [], lower: [], hasSends: false, promotedGrade: null },
    });
  });

  it("returns both disciplines in one response, reflecting the caller's own sends", async () => {
    await postEntry({ type: "boulder", grade: "6B" });
    await postEntry({ type: "lead", grade: "6a" });

    const res = await get();
    expect(res.status).toBe(200);
    const { boulder, lead } = await res.json();
    expect(boulder.hasSends).toBe(true);
    expect(boulder.top4.some(r => r.grade === "6B" && r.count === 1)).toBe(true);
    expect(lead.hasSends).toBe(true);
    expect(lead.top4.some(r => r.grade === "6a" && r.count === 1)).toBe(true);
  });

  it("excludes non-send statuses and out-of-window dates, same rules as the pure function", async () => {
    await postEntry({ status: "project" });
    await postEntry({ date: "2020-01-01" }); // over a year old
    const { boulder } = await (await get()).json();
    expect(boulder.hasSends).toBe(false);
  });

  it("sets Cache-Control: no-store, same as every other GET here", async () => {
    const res = await get();
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("a second user's own request never reflects the first user's sends", async () => {
    await postEntry();

    const userB = await createAuthedSession();
    const res = await get(userB.cookie);
    expect(await res.json()).toEqual({
      boulder: { top4: [], lower: [], hasSends: false, promotedGrade: null },
      lead: { top4: [], lower: [], hasSends: false, promotedGrade: null },
    });
  });
});
