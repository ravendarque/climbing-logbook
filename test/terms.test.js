import { env } from "cloudflare:workers";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { TERMS_HISTORY, TERMS_VERSION, termsUpdate } from "../shared/terms.js";
import { createAuthedSession, fetchJson, jsonRequest, resetAuthTables, seedPlace } from "./support.js";

describe("termsUpdate (#1354)", () => {
  it("is null for an account on the latest version", () => {
    expect(termsUpdate(TERMS_VERSION)).toBeNull();
  });

  it("is required once a newer version has taken effect, listing what changed since", () => {
    expect(termsUpdate("2026-10-07", "2026-10-11")).toEqual({
      version: TERMS_VERSION,
      effective: "2026-10-11",
      required: true,
      changes: TERMS_HISTORY[1].changes,
    });
  });

  it("can wait while the newer version is still in its notice period", () => {
    expect(termsUpdate("2026-10-07", "2026-10-10")).toMatchObject({ effective: "2026-10-11", required: false });
  });

  it("lists every change for an account that never agreed to a version", () => {
    expect(termsUpdate(null).changes).toEqual(TERMS_HISTORY.flatMap(({ changes }) => changes));
  });
});

describe("agreeing to updated terms (#1354)", () => {
  beforeAll(() => {
    env.BETA_GATE_ENABLED = "false";
  });
  afterAll(() => {
    env.BETA_GATE_ENABLED = "true";
  });

  let cookie;
  let userId;
  beforeEach(async () => {
    await resetAuthTables();
    ({ cookie, userId } = await createAuthedSession());
  });

  const settings = async () => (await fetchJson("/-/api/settings", { headers: { Cookie: cookie } })).json();
  const agree = version => jsonRequest("POST", "/-/api/terms", { version }, { Cookie: cookie });
  const putOnOlderTerms = () =>
    env.LOGBOOK_DB.prepare(`UPDATE "user" SET termsVersion = ?, termsAgreedAt = NULL WHERE id = ?`)
      .bind(TERMS_HISTORY[0].version, userId)
      .run();

  it("doesn't ask a new sign-up", async () => {
    expect((await settings()).terms).toBeNull();
  });

  it("asks an account on older terms, and pauses its saves but not its reads", async () => {
    const placeId = await seedPlace(cookie);
    await putOnOlderTerms();

    expect((await settings()).terms).toMatchObject({ version: TERMS_VERSION, required: true });
    const refused = await jsonRequest(
      "POST",
      "/-/api/entries",
      { name: "Boundary", grade: "6B", placeId, type: "boulder", status: "send" },
      { Cookie: cookie },
    );
    expect(refused.status).toBe(428);
    expect(await refused.json()).toMatchObject({ code: "TERMS_NOT_AGREED" });
    expect((await jsonRequest("PATCH", "/-/api/settings", { athleteMode: true }, { Cookie: cookie })).status).toBe(428);
    expect((await fetchJson("/-/api/entries", { headers: { Cookie: cookie } })).status).toBe(200);
  });

  it("records the agreement, after which saves go through", async () => {
    await putOnOlderTerms();
    expect((await agree(TERMS_VERSION)).status).toBe(204);

    const user = await env.LOGBOOK_DB.prepare(`SELECT termsVersion, termsAgreedAt FROM "user" WHERE id = ?`)
      .bind(userId)
      .first();
    expect(user.termsVersion).toBe(TERMS_VERSION);
    expect(Date.now() - Date.parse(user.termsAgreedAt)).toBeLessThan(60_000);
    expect((await settings()).terms).toBeNull();
    expect((await jsonRequest("PATCH", "/-/api/settings", { athleteMode: true }, { Cookie: cookie })).status).toBe(200);
  });

  it("won't record agreement to a version that isn't the latest", async () => {
    await putOnOlderTerms();
    const res = await agree(TERMS_HISTORY[0].version);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "TERMS_CHANGED" });
  });
});
