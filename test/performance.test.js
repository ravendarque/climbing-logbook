// Exercises server/api/performance.js through the real Worker entrypoint
// (real routing + real D1 binding) -- proves the HTTP wiring (auth
// resolution, both disciplines in one response, cross-user isolation).
// The pyramid math itself (send-counting, 8-4-2-1 promotion) is already
// thoroughly covered directly against the pure functions in
// test/shared/pyramid-stats.test.js -- not re-verified exhaustively here.
import { env } from "cloudflare:workers";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createAuthedSession, fetchJson, jsonRequest, resetAuthTables, seedPlace } from "./support.js";
import { MIN_TAG_COUNT } from "../shared/injury-stats.js";

const PYRAMID_URL = "/logbook/api/performance/pyramid";
const INJURY_URL = "/logbook/api/performance/injury";
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
function getInjuryLog(extraCookie = cookie) {
  return fetchJson(INJURY_URL, { headers: { Cookie: extraCookie } });
}
// Matches test/logbook.test.js's own del() convention exactly (#499's
// soft-delete DELETE ?id= route) -- needed here to prove a soft-deleted
// entry's pain moves drop out of both the log and the cluster count.
function del(id, extraCookie = cookie) {
  const path = id === undefined ? ADMIN_ENTRY_URL : `${ADMIN_ENTRY_URL}?id=${encodeURIComponent(id)}`;
  return fetchJson(path, { method: "DELETE", headers: { Cookie: extraCookie } });
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

describe("handleGetInjuryLog", () => {
  it("returns an empty log and null cluster for a user with no pain-tagged entries", async () => {
    await postEntry();
    const res = await getInjuryLog();
    const body = await res.json();
    expect(body.log).toEqual([]);
    expect(body.cluster).toBeNull();
  });

  it("returns an empty log and null cluster for an anonymous caller", async () => {
    const res = await fetchJson(INJURY_URL);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ log: [], cluster: null });
  });

  it("includes only entries that have at least one pain move", async () => {
    await postEntry();
    await postEntry({ name: "Painful Route", painMoves: [{ limb: "hand", side: "left", holdType: "crimp", movementStyle: "static", wallAngle: "overhang" }] });
    const res = await getInjuryLog();
    const { log } = await res.json();
    expect(log).toHaveLength(1);
    expect(log[0].name).toBe("Painful Route");
    expect(log[0].painMoves).toHaveLength(1);
  });

  it("surfaces a cluster once 5 matching pain moves exist across entries", async () => {
    for (let i = 0; i < MIN_TAG_COUNT; i++) {
      await postEntry({ name: `Route ${i}`, painMoves: [{ limb: "foot", side: "right", holdType: "toe-hook", movementStyle: "dynamic", wallAngle: "slab" }] });
    }
    const res = await getInjuryLog();
    const { cluster } = await res.json();
    expect(cluster).toMatchObject({ limb: "foot", side: "right", holdType: "toe-hook", wallAngle: "slab", count: MIN_TAG_COUNT });
  });

  it("excludes a soft-deleted entry's pain moves from both the log and the cluster count", async () => {
    const created = await (await postEntry({ painMoves: [{ limb: "hand", side: "left", holdType: "crimp", movementStyle: "static", wallAngle: "overhang" }] })).json();
    await del(created.entries[0].id);
    const res = await getInjuryLog();
    const body = await res.json();
    expect(body.log).toEqual([]);
    expect(body.cluster).toBeNull();
  });

  it("a second user's own request never reflects the first user's pain-tagged entries", async () => {
    await postEntry({ painMoves: [{ limb: "hand", side: "left", holdType: "crimp", movementStyle: "static", wallAngle: "overhang" }] });

    const userB = await createAuthedSession();
    const res = await getInjuryLog(userB.cookie);
    expect(await res.json()).toEqual({ log: [], cluster: null });
  });
});

const STRENGTHS_URL = "/logbook/api/performance/strengths";
function getStrengths(params = {}, extraCookie = cookie) {
  const qs = new URLSearchParams(params).toString();
  return fetchJson(`${STRENGTHS_URL}${qs ? `?${qs}` : ""}`, { headers: { Cookie: extraCookie } });
}

describe("handleGetStrengthsWeaknesses", () => {
  it("returns a null headline and empty anchors for a user with no tagged moves", async () => {
    await postEntry();
    const res = await getStrengths();
    const body = await res.json();
    expect(body.headline).toBeNull();
    expect(body.anchors).toEqual([]);
  });

  it("surfaces a headline once 5 matching hardest tags exist across entries", async () => {
    for (let i = 0; i < 5; i++) {
      await postEntry({ name: `Route ${i}`, moves: [{ difficulty: "hardest", limb: "hand", side: "left", holdType: "crimp", movementStyle: "static", wallAngle: "overhang" }] });
    }
    const res = await getStrengths();
    const { headline } = await res.json();
    expect(headline.text).toBe("Your left hand on overhanging crimps looks like a key weakness.");
    expect(headline.cell).toMatchObject({ limb: "hand", side: "left", holdType: "crimp", score: 1 });
  });

  it("lists available anchors once moves are tagged", async () => {
    await postEntry({ moves: [{ difficulty: "hardest", limb: "foot", side: "right", holdType: "toe-hook", movementStyle: "dynamic", wallAngle: "slab" }] });
    const { anchors } = await (await getStrengths()).json();
    // #614 -- sentence case via humanize() now, not the raw value/old
    // Title Case (see shared/strengths-stats.test.js for the dedicated
    // humanize() coverage).
    expect(anchors).toContainEqual({ dimension: "holdType", value: "toe-hook", label: "Toe hook" });
    expect(anchors).toContainEqual({ dimension: "limbSide", value: "foot-right", label: "Right foot" });
  });

  it("returns a ranked drill-down for a fixed anchor", async () => {
    for (let i = 0; i < 5; i++) {
      await postEntry({ name: `Route ${i}`, moves: [{ difficulty: "hardest", limb: "hand", side: "left", holdType: "crimp", movementStyle: "static", wallAngle: "overhang" }] });
    }
    const { ranked } = await (await getStrengths({ dimension: "holdType", value: "crimp" })).json();
    expect(ranked).toHaveLength(1);
    expect(ranked[0]).toMatchObject({ holdType: "crimp", score: 1, total: 5 });
  });

  it("excludes a soft-deleted entry's moves from both the headline and the anchor list", async () => {
    const created = await (await postEntry({ moves: [{ difficulty: "hardest", limb: "hand", side: "left", holdType: "crimp", movementStyle: "static", wallAngle: "overhang" }] })).json();
    await del(created.entries[0].id);
    const body = await (await getStrengths()).json();
    expect(body.headline).toBeNull();
    expect(body.anchors).toEqual([]);
  });

  it("returns an empty headline/anchors for an anonymous caller", async () => {
    const res = await fetchJson(STRENGTHS_URL);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ headline: null, anchors: [] });
  });

  it("a second user's own request never reflects the first user's tagged moves", async () => {
    await postEntry({ moves: [{ difficulty: "hardest", limb: "hand", side: "left", holdType: "crimp", movementStyle: "static", wallAngle: "overhang" }] });
    const userB = await createAuthedSession();
    const body = await (await getStrengths({}, userB.cookie)).json();
    expect(body).toEqual({ headline: null, anchors: [] });
  });
});

const VOLUME_URL = "/logbook/api/performance/volume";
function getVolume(params, extraCookie = cookie) {
  const qs = new URLSearchParams(params).toString();
  return fetchJson(`${VOLUME_URL}?${qs}`, { headers: { Cookie: extraCookie } });
}

// #600 -- a 21-day window (2026-01-01..2026-01-21) is short enough that
// weekBuckets() picks a 1-week bucket width (matching the old 3-monthly-
// bucket tests' own shape: 3 buckets, "the middle one" as the target for
// a real entry). The middle bucket covers 2026-01-08..2026-01-14 -- entries
// use 2026-01-10 (was 2026-02-10 under the old calendar-month scheme) as
// "falls in the middle bucket".
const WINDOW = { start: "2026-01-01", end: "2026-01-21" };

describe("handleGetVolume", () => {
  it("returns 400 when start or end is missing", async () => {
    expect((await getVolume({ end: WINDOW.end })).status).toBe(400);
    expect((await getVolume({ start: WINDOW.start })).status).toBe(400);
  });

  it("returns 400 when start or end isn't a YYYY-MM-DD-shaped date", async () => {
    expect((await getVolume({ start: "not-a-date", end: WINDOW.end })).status).toBe(400);
    expect((await getVolume({ start: WINDOW.start, end: "not-a-date" })).status).toBe(400);
  });

  it("returns 400 when the requested span exceeds the max window", async () => {
    const res = await getVolume({ start: "0001-01-01", end: "9999-12-31" });
    expect(res.status).toBe(400);
  });

  it("returns empty per-bucket data for a user with no sends in the window", async () => {
    await postEntry({ date: "2020-01-01" }); // outside the window
    const { boulder } = await (await getVolume(WINDOW)).json();
    expect(boulder.buckets).toEqual(["-3w", "-2w", "-1w"]);
    expect(boulder.sendCounts).toEqual([0, 0, 0]);
  });

  it("reflects real sends within the window, split by discipline", async () => {
    await postEntry({ type: "boulder", grade: "6B", date: "2026-01-10" });
    await postEntry({ type: "lead", grade: "6a", date: "2026-01-12" });
    const body = await (await getVolume(WINDOW)).json();
    expect(body.boulder.sendCounts).toEqual([0, 1, 0]);
    expect(body.lead.sendCounts).toEqual([0, 1, 0]);
  });

  it("excludes a soft-deleted entry", async () => {
    const created = await (await postEntry({ date: "2026-01-10" })).json();
    await del(created.entries[0].id);
    const { boulder } = await (await getVolume(WINDOW)).json();
    expect(boulder.sendCounts).toEqual([0, 0, 0]);
  });

  it("returns empty per-bucket data for an anonymous caller", async () => {
    const res = await fetchJson(`${VOLUME_URL}?start=${WINDOW.start}&end=${WINDOW.end}`);
    expect(res.status).toBe(200);
    const { boulder } = await res.json();
    expect(boulder.sendCounts).toEqual([0, 0, 0]);
  });

  it("a second user's own request never reflects the first user's sends", async () => {
    await postEntry({ date: "2026-01-10" });
    const userB = await createAuthedSession();
    const { boulder } = await (await getVolume(WINDOW, userB.cookie)).json();
    expect(boulder.sendCounts).toEqual([0, 0, 0]);
  });
});

const GAP_URL = "/logbook/api/performance/gap";
function getGap(params, extraCookie = cookie) {
  const qs = new URLSearchParams(params).toString();
  return fetchJson(`${GAP_URL}?${qs}`, { headers: { Cookie: extraCookie } });
}

describe("handleGetGap", () => {
  it("returns 400 when start or end is missing", async () => {
    expect((await getGap({ end: WINDOW.end })).status).toBe(400);
    expect((await getGap({ start: WINDOW.start })).status).toBe(400);
  });

  it("returns 400 for a malformed date", async () => {
    expect((await getGap({ start: "not-a-date", end: WINDOW.end })).status).toBe(400);
  });

  it("returns 400 for a span exceeding the max window", async () => {
    expect((await getGap({ start: "0001-01-01", end: "9999-12-31" })).status).toBe(400);
  });

  it("returns empty per-bucket data for a user with no sends in the window", async () => {
    await postEntry({ date: "2020-01-01" }); // outside the window
    const { boulder } = await (await getGap(WINDOW)).json();
    expect(boulder.buckets).toEqual(["-3w", "-2w", "-1w"]);
    expect(boulder.sendMaxByBucket).toEqual([null, null, null]);
    expect(boulder.headline).toBe("No sends logged in this window yet.");
  });

  it("reflects real sends within the window, split by discipline and firstAttempt", async () => {
    await postEntry({ type: "boulder", grade: "6B", date: "2026-01-10", firstAttempt: true });
    await postEntry({ type: "lead", grade: "6a", date: "2026-01-12", firstAttempt: false });
    const body = await (await getGap(WINDOW)).json();
    expect(body.boulder.flashMaxByBucket).toEqual([null, "6B", null]);
    expect(body.lead.flashMaxByBucket).toEqual([null, null, null]);
    expect(body.lead.sendMaxByBucket).toEqual([null, "6a", null]);
  });

  it("excludes a soft-deleted entry", async () => {
    const created = await (await postEntry({ date: "2026-01-10" })).json();
    await del(created.entries[0].id);
    const { boulder } = await (await getGap(WINDOW)).json();
    expect(boulder.sendMaxByBucket).toEqual([null, null, null]);
  });

  it("returns empty per-bucket data for an anonymous caller", async () => {
    const res = await fetchJson(`${GAP_URL}?start=${WINDOW.start}&end=${WINDOW.end}`);
    expect(res.status).toBe(200);
    const { boulder } = await res.json();
    expect(boulder.sendMaxByBucket).toEqual([null, null, null]);
  });

  it("a second user's own request never reflects the first user's sends", async () => {
    await postEntry({ date: "2026-01-10" });
    const userB = await createAuthedSession();
    const { boulder } = await (await getGap(WINDOW, userB.cookie)).json();
    expect(boulder.sendMaxByBucket).toEqual([null, null, null]);
  });
});

const EFFORT_URL = "/logbook/api/performance/rpe";
function getEffort(params, extraCookie = cookie) {
  const qs = new URLSearchParams(params).toString();
  return fetchJson(`${EFFORT_URL}?${qs}`, { headers: { Cookie: extraCookie } });
}

describe("handleGetEffort", () => {
  it("returns 400 when start or end is missing", async () => {
    expect((await getEffort({ end: WINDOW.end })).status).toBe(400);
    expect((await getEffort({ start: WINDOW.start })).status).toBe(400);
  });

  it("returns 400 for a malformed date", async () => {
    expect((await getEffort({ start: "not-a-date", end: WINDOW.end })).status).toBe(400);
  });

  it("returns 400 for a span exceeding the max window", async () => {
    expect((await getEffort({ start: "0001-01-01", end: "9999-12-31" })).status).toBe(400);
  });

  it("returns a null headline for a user below the confidence gate", async () => {
    await postEntry({ date: "2026-01-10", rpe: 70 });
    const { boulder } = await (await getEffort(WINDOW)).json();
    expect(boulder.headline).toBeNull();
    // #603 -- null (not 0) for a bucket with no rpe data at all.
    expect(boulder.avgExertionByBucket).toEqual([null, 70, null]);
  });

  it("reflects real sends within the window, split by discipline", async () => {
    await postEntry({ type: "boulder", grade: "6B", date: "2026-01-10", rpe: 60 });
    await postEntry({ type: "lead", grade: "6a", date: "2026-01-12", rpe: 80 });
    const body = await (await getEffort(WINDOW)).json();
    expect(body.boulder.avgExertionByBucket).toEqual([null, 60, null]);
    expect(body.lead.avgExertionByBucket).toEqual([null, 80, null]);
  });

  it("excludes a soft-deleted entry", async () => {
    const created = await (await postEntry({ date: "2026-01-10" })).json();
    await del(created.entries[0].id);
    const { boulder } = await (await getEffort(WINDOW)).json();
    expect(boulder.avgExertionByBucket).toEqual([null, null, null]);
  });

  it("returns empty per-bucket data for an anonymous caller", async () => {
    const res = await fetchJson(`${EFFORT_URL}?start=${WINDOW.start}&end=${WINDOW.end}`);
    expect(res.status).toBe(200);
    const { boulder } = await res.json();
    expect(boulder.avgExertionByBucket).toEqual([null, null, null]);
  });

  it("a second user's own request never reflects the first user's sends", async () => {
    await postEntry({ date: "2026-01-10", rpe: 90 });
    const userB = await createAuthedSession();
    const { boulder } = await (await getEffort(WINDOW, userB.cookie)).json();
    expect(boulder.avgExertionByBucket).toEqual([null, null, null]);
  });
});
