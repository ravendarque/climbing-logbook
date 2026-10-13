import { env } from "cloudflare:workers";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PAIN_INJURY } from "../shared/health-consent.js";
import {
  createAuthedSession,
  fetchJson,
  grantPainInjuryConsent,
  jsonRequest,
  resetAuthTables,
  seedPlace,
} from "./support.js";

const CONSENT_URL = "/-/api/consent/pain-injury";
const PAIN = {
  limb: "hand",
  side: "left",
  holdType: "crimp",
  movementStyle: "static",
  wallAngle: "overhang",
};

beforeAll(() => {
  env.BETA_GATE_ENABLED = "false";
});
afterAll(() => {
  env.BETA_GATE_ENABLED = "true";
});

let cookie;
let userId;
let placeId;
beforeEach(async () => {
  await resetAuthTables();
  ({ cookie, userId } = await createAuthedSession());
  placeId = await seedPlace(cookie);
});

const as = c => ({ Cookie: c });
const entry = (overrides = {}) => ({
  name: "Pinch Me",
  grade: "6B",
  placeId,
  type: "boulder",
  status: "send",
  date: "2026-06-01",
  ...overrides,
});
const postEntry = (body, c = cookie) => jsonRequest("POST", "/-/api/entries", body, as(c));
const status = async (c = cookie) => (await fetchJson(CONSENT_URL, { headers: as(c) })).json();
const withdraw = (c = cookie) => fetchJson(CONSENT_URL, { method: "DELETE", headers: as(c) });
const consentRows = () =>
  env.LOGBOOK_DB.prepare(`SELECT * FROM consents WHERE user_id = ? ORDER BY granted_at`).bind(userId).all();

describe("pain and injury consent (#1120)", () => {
  it("starts off, and a new account's settings say so", async () => {
    expect(await status()).toMatchObject({
      granted: false,
      version: null,
      currentVersion: PAIN_INJURY.version,
    });
    const settings = await (await fetchJson("/-/api/settings", { headers: as(cookie) })).json();
    expect(settings.healthConsent).toEqual({ painInjury: false, painInjuryUpdate: null });
  });

  it("records a grant with the wording version the user saw", async () => {
    await grantPainInjuryConsent(cookie);
    expect(await status()).toMatchObject({
      granted: true,
      version: PAIN_INJURY.version,
    });
    const settings = await (await fetchJson("/-/api/settings", { headers: as(cookie) })).json();
    expect(settings.healthConsent).toEqual({ painInjury: true, painInjuryUpdate: null });
  });

  it("refuses a grant for wording that isn't current, and one with no version", async () => {
    expect((await jsonRequest("POST", CONSENT_URL, { version: "2000-01-01" }, as(cookie))).status).toBe(409);
    expect((await jsonRequest("POST", CONSENT_URL, {}, as(cookie))).status).toBe(400);
    expect((await status()).granted).toBe(false);
  });

  it("keeps one current grant when the same version is agreed twice", async () => {
    await grantPainInjuryConsent(cookie);
    await grantPainInjuryConsent(cookie);
    expect((await consentRows()).results).toHaveLength(1);
  });

  it("tells settings when the agreed wording needs agreeing to again", async () => {
    await env.LOGBOOK_DB.prepare(
      `INSERT INTO consents (id, user_id, purpose, wording_version, granted_at) VALUES ('old', ?, ?, '2000-01-01', '2000-01-01T00:00:00Z')`,
    )
      .bind(userId, PAIN_INJURY.purpose)
      .run();
    const settings = await (await fetchJson("/-/api/settings", { headers: as(cookie) })).json();
    expect(settings.healthConsent).toMatchObject({
      painInjury: true,
      painInjuryUpdate: { version: PAIN_INJURY.version, required: true },
    });
  });

  it("supersedes a grant of older wording rather than overwriting it", async () => {
    await env.LOGBOOK_DB.prepare(
      `INSERT INTO consents (id, user_id, purpose, wording_version, granted_at) VALUES ('old', ?, ?, '2000-01-01', '2000-01-01T00:00:00Z')`,
    )
      .bind(userId, PAIN_INJURY.purpose)
      .run();
    await grantPainInjuryConsent(cookie);
    const rows = (await consentRows()).results;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      wording_version: "2000-01-01",
      withdrawn_at: null,
    });
    expect(rows[0].superseded_at).not.toBeNull();
    expect(rows[1]).toMatchObject({
      wording_version: PAIN_INJURY.version,
      superseded_at: null,
      withdrawn_at: null,
    });
  });

  it("deletes every pain detail on withdrawal, counts the entries, and keeps the entries", async () => {
    await grantPainInjuryConsent(cookie);
    await postEntry(entry({ painMoves: [PAIN, { ...PAIN, side: "right" }] }));
    await postEntry(entry({ painMoves: [PAIN] }));
    await postEntry(entry());
    expect((await status()).entriesWithPain).toBe(2);

    const res = await withdraw();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: 2 });

    const left = await env.LOGBOOK_DB.prepare(
      `SELECT COUNT(*) AS n FROM entry_pain_moves WHERE entry_id IN (SELECT id FROM entries WHERE user_id = ?)`,
    )
      .bind(userId)
      .first();
    expect(left.n).toBe(0);
    expect(await status()).toMatchObject({
      granted: false,
      entriesWithPain: 0,
    });
    const { entries } = await (await fetchJson("/-/api/entries", { headers: as(cookie) })).json();
    expect(entries).toHaveLength(3);
  });

  it("keeps the withdrawn grant as a record", async () => {
    await grantPainInjuryConsent(cookie);
    await withdraw();
    const [row] = (await consentRows()).results;
    expect(row.withdrawn_at).not.toBeNull();
  });

  it("leaves another user's pain details alone", async () => {
    const other = await createAuthedSession();
    const otherPlace = await seedPlace(other.cookie);
    await grantPainInjuryConsent(other.cookie);
    await postEntry(entry({ placeId: otherPlace, painMoves: [PAIN] }), other.cookie);

    await grantPainInjuryConsent(cookie);
    await postEntry(entry({ painMoves: [PAIN] }));
    await withdraw();

    expect((await status(other.cookie)).entriesWithPain).toBe(1);
  });

  it("tells other devices to drop their copy through delta sync", async () => {
    await grantPainInjuryConsent(cookie);
    const { entry: created } = await (await postEntry(entry({ painMoves: [PAIN] }))).json();
    const { cursor } = await (await fetchJson("/-/api/entries?since=0", { headers: as(cookie) })).json();

    await withdraw();
    const delta = await (
      await fetchJson(`/-/api/entries?since=${cursor + 1}`, {
        headers: as(cookie),
      })
    ).json();
    expect(delta.entries.map(e => e.id)).toEqual([created.id]);
    expect(delta.entries[0].painMoves).toEqual([]);
  });

  it("lets a user withdraw while updated terms are waiting to be agreed", async () => {
    await grantPainInjuryConsent(cookie);
    await env.LOGBOOK_DB.prepare(`UPDATE "user" SET termsVersion = '2000-01-01' WHERE id = ?`).bind(userId).run();
    expect((await withdraw()).status).toBe(200);
  });
});
