import { env, exports } from "cloudflare:workers";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createAuthedSession, jsonRequest, resetAuthTables, seedPlace } from "./support.js";

beforeAll(() => { env.BETA_GATE_ENABLED = "false"; });
afterAll(() => { env.BETA_GATE_ENABLED = "true"; });

function fetchProfile(username, hostname = "my.example.com") {
  return exports.default.fetch(`https://${hostname}/${username}`);
}

beforeEach(async () => {
  await resetAuthTables();
});

describe("public profile routing", () => {
  it("404s for a hostname without a my. prefix, even with a matching path", async () => {
    const res = await exports.default.fetch("https://example.com/someone");
    expect(res.status).toBe(404);
  });

  it("falls through (404) for a my. hostname with more than one path segment", async () => {
    const res = await exports.default.fetch("https://my.example.com/someone/extra");
    expect(res.status).toBe(404);
  });

  it("falls through (404) for non-GET methods on a my. hostname", async () => {
    const res = await exports.default.fetch("https://my.example.com/someone", { method: "POST" });
    expect(res.status).toBe(404);
  });

  it("404s a username that doesn't exist", async () => {
    const res = await fetchProfile("nobody-by-this-name");
    expect(res.status).toBe(404);
    expect(await res.text()).toContain("doesn&#39;t exist");
  });
});

describe("public profile visibility", () => {
  it("serves the real static shell by default (logbook_public defaults to 1)", async () => {
    await createAuthedSession({ username: "publicuser" });

    const res = await fetchProfile("publicuser");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("<climbing-entries-table");
    expect(html).toMatch(/src="\/-\/profile-app\.js(\?v=\d+)?"/);
  });

  it("looks up the username case-insensitively", async () => {
    await createAuthedSession({ username: "mixedcaseuser" });
    const res = await fetchProfile("MixedCaseUser");
    expect(res.status).toBe(200);
  });

  it("404s (not the shell) once logbook_public is turned off", async () => {
    const { cookie } = await createAuthedSession({ username: "privateuser" });
    const placeId = await seedPlace(cookie);
    await jsonRequest("POST", "/-/api/entries", { placeId, name: "Sleepwalker", grade: "7A", type: "boulder", status: "send" }, { Cookie: cookie });

    await jsonRequest("PATCH", "/-/api/settings", {}, { Cookie: cookie }); // creates the settings row
    await env.LOGBOOK_DB.prepare(`UPDATE settings SET logbook_public = 0 WHERE user_id = (SELECT id FROM "user" WHERE username = 'privateuser')`).run();

    const res = await fetchProfile("privateuser");
    expect(res.status).toBe(404);
    expect(await res.text()).toContain("doesn&#39;t exist");
  });
});
