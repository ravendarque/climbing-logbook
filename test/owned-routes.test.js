// #347 -- my.<domain>/:username/{log,map,performance}, the authenticated
// owner's own routes. Session's own user id must match the user id the
// URL's :username resolves to, else redirect to login -- the per-user
// equivalent of what Cloudflare Access used to do for the single, global
// /logbook URL. Exercised via the real Worker entrypoint with an explicit
// Host header, same "public HTTP contract" philosophy as
// test/public-profile.test.js.
import { env, exports } from "cloudflare:workers";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createAuthedSession, resetAuthTables } from "./support.js";

// #443/#548, ADR-0020 -- sets the tri-state beta_opt_in column directly
// (not via the PATCH endpoint) so each test can set up exactly the state
// it wants to assert against, independent of the settings API's own
// coverage (test/handlers.test.js). Upsert, same shape as server/api/
// settings.js's own handlePatchSettings -- a user's settings row may not
// exist yet (only created on their first PATCH in real usage).
async function setBetaOptIn(userId, value) {
  await env.LOGBOOK_DB
    .prepare(`INSERT INTO settings (user_id, beta_opt_in) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET beta_opt_in = excluded.beta_opt_in`)
    .bind(userId, value === null ? null : value ? 1 : 0)
    .run();
}

beforeAll(() => { env.BETA_GATE_ENABLED = "false"; });
afterAll(() => { env.BETA_GATE_ENABLED = "true"; });

function fetchOwnedRoute(username, page, { hostname = "my.climbinglogbook.com", cookie } = {}) {
  return exports.default.fetch(`https://${hostname}/${username}/${page}`, {
    redirect: "manual",
    headers: cookie ? { Cookie: cookie } : {},
  });
}

beforeEach(async () => {
  await resetAuthTables();
});

describe("owned route authorization", () => {
  it("serves the page when the session's own username matches the URL", async () => {
    const { cookie } = await createAuthedSession({ username: "ownerofthis", hostname: "climbinglogbook.com" });
    const res = await fetchOwnedRoute("ownerofthis", "log", { cookie });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("log");
  });

  it("redirects to login with no session at all", async () => {
    const res = await fetchOwnedRoute("someone", "log");
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("https://climbinglogbook.com/login/");
  });

  it("redirects to login when logged in as a *different* user", async () => {
    await createAuthedSession({ username: "targetuser", hostname: "climbinglogbook.com" });
    const { cookie: otherCookie } = await createAuthedSession({ username: "differentuser", hostname: "climbinglogbook.com" });
    const res = await fetchOwnedRoute("targetuser", "log", { cookie: otherCookie });
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("https://climbinglogbook.com/login/");
  });

  it("redirects to login for a username that doesn't exist at all -- same response as a wrong user (anti-enumeration)", async () => {
    const { cookie } = await createAuthedSession({ username: "realuser", hostname: "climbinglogbook.com" });
    const res = await fetchOwnedRoute("nobody-by-this-name", "log", { cookie });
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("https://climbinglogbook.com/login/");
  });

  it("looks up the username case-insensitively", async () => {
    const { cookie } = await createAuthedSession({ username: "mixedcaseowner", hostname: "climbinglogbook.com" });
    const res = await fetchOwnedRoute("MixedCaseOwner", "map", { cookie });
    expect(res.status).toBe(200);
  });

  it("accepts all page shapes: log, map, performance, account, account/edit, account/import", async () => {
    const { cookie } = await createAuthedSession({ username: "allpagesuser", hostname: "climbinglogbook.com" });
    for (const page of ["log", "map", "performance", "account", "account/edit", "account/import"]) {
      const res = await fetchOwnedRoute("allpagesuser", page, { cookie });
      expect(res.status).toBe(200);
    }
  });

  // #348 -- all three pages now have real shells (fetched via the ASSETS
  // binding, see server/api/owned-routes.js's SHELL_PATHS). Asserting each
  // real shell's actual content here (not just a 200, which the test
  // above already covers) is what would have caught the shell/bundle
  // wiring being wrong even though the auth decision itself was right.
  it("serves the real static shell for map", async () => {
    const { cookie } = await createAuthedSession({ username: "mapshelluser", hostname: "climbinglogbook.com" });
    const res = await fetchOwnedRoute("mapshelluser", "map", { cookie });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("<climbing-tab-bar");
    expect(html).toContain('src="/logbook/map-app.js"');
  });

  it("serves the real static shell for performance", async () => {
    // #575 -- bare /performance is the Performance Insights hub now (one
    // tile per insight, id="insight-tiles"), not the Grade Pyramid itself
    // (that moved to its own /performance/pyramid sub-page under #348).
    const { cookie } = await createAuthedSession({ username: "performanceshelluser", hostname: "climbinglogbook.com" });
    const res = await fetchOwnedRoute("performanceshelluser", "performance", { cookie });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('id="insight-tiles"');
    expect(html).toContain('src="/logbook/performance-hub-app.js"');
  });

  it("serves the real static shell for performance/pyramid", async () => {
    const { cookie } = await createAuthedSession({ username: "pyramidshelluser", hostname: "climbinglogbook.com" });
    const res = await fetchOwnedRoute("pyramidshelluser", "performance/pyramid", { cookie });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("<climbing-grade-pyramid");
    expect(html).toContain('src="/logbook/performance-pyramid-app.js"');
  });

  it("serves the real static shell for performance/injury", async () => {
    const { cookie } = await createAuthedSession({ username: "injuryshelluser", hostname: "climbinglogbook.com" });
    const res = await fetchOwnedRoute("injuryshelluser", "performance/injury", { cookie });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('id="injury-log-root"');
    expect(html).toContain('src="/logbook/performance-injury-app.js"');
  });

  it("serves the real static shell for performance/strengths", async () => {
    const { cookie } = await createAuthedSession({ username: "strengthsshelluser", hostname: "climbinglogbook.com" });
    const res = await fetchOwnedRoute("strengthsshelluser", "performance/strengths", { cookie });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('id="strengths-root"');
    expect(html).toContain('src="/logbook/performance-strengths-app.js"');
  });

  it("serves the real static shell for log", async () => {
    const { cookie } = await createAuthedSession({ username: "logshelluser", hostname: "climbinglogbook.com" });
    const res = await fetchOwnedRoute("logshelluser", "log", { cookie });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("<climbing-entries-table");
    expect(html).toContain('src="/logbook/log-app.js"');
  });

  it("serves the real static shell for account", async () => {
    const { cookie } = await createAuthedSession({ username: "accountshelluser", hostname: "climbinglogbook.com" });
    const res = await fetchOwnedRoute("accountshelluser", "account", { cookie });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("My account");
    expect(html).toContain('src="/logbook/account-app.js"');
  });

  it("serves the real static shell for account/edit", async () => {
    const { cookie } = await createAuthedSession({ username: "accounteditshelluser", hostname: "climbinglogbook.com" });
    const res = await fetchOwnedRoute("accounteditshelluser", "account/edit", { cookie });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Edit account details");
    expect(html).toContain('src="/logbook/account-edit-app.js"');
  });

  it("serves the real static shell for account/import", async () => {
    const { cookie } = await createAuthedSession({ username: "accountimportshelluser", hostname: "climbinglogbook.com" });
    const res = await fetchOwnedRoute("accountimportshelluser", "account/import", { cookie });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Import entries");
    expect(html).toContain('src="/logbook/account-import-app.js"');
  });

  it("falls through (404) for a fourth path segment that isn't log/map/performance", async () => {
    const { cookie } = await createAuthedSession({ username: "unknownpageuser", hostname: "climbinglogbook.com" });
    const res = await fetchOwnedRoute("unknownpageuser", "settings", { cookie });
    expect(res.status).toBe(404);
  });

  it("redirects same-origin on hostnames without a real climbinglogbook.com apex (local dev)", async () => {
    const res = await exports.default.fetch("https://my.localhost/someone/log", { redirect: "manual" });
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("https://my.localhost/login/");
  });
});

// #443/#548, ADR-0020 -- beta.<domain>'s equivalent of the suite above,
// additionally gated by settings.beta_opt_in. Session/ownership coverage
// (no session, wrong user, unknown username) is deliberately not
// re-proven here -- handleBetaGatedRoute shares resolveOwnedSession()
// with handleOwnedRoute verbatim, already covered by the suite above.
describe("beta-gated route authorization", () => {
  it("opted in -- serves the real page shell, same as my.x would", async () => {
    const { cookie, userId } = await createAuthedSession({ username: "betainuser", hostname: "climbinglogbook.com" });
    await setBetaOptIn(userId, true);
    const res = await fetchOwnedRoute("betainuser", "log", { hostname: "beta.climbinglogbook.com", cookie });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("<climbing-entries-table");
    expect(html).toContain('src="/logbook/log-app.js"');
  });

  it("opted out -- redirects silently to the equivalent my.x path, not the gate shell", async () => {
    const { cookie, userId } = await createAuthedSession({ username: "betaoutuser", hostname: "climbinglogbook.com" });
    await setBetaOptIn(userId, false);
    const res = await fetchOwnedRoute("betaoutuser", "map", { hostname: "beta.climbinglogbook.com", cookie });
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("https://my.climbinglogbook.com/betaoutuser/map");
  });

  it("never decided (no settings row at all) -- serves the gate shell, not the real page", async () => {
    const { cookie } = await createAuthedSession({ username: "betaneveruser", hostname: "climbinglogbook.com" });
    const res = await fetchOwnedRoute("betaneveruser", "performance", { hostname: "beta.climbinglogbook.com", cookie });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("<beta-opt-in-modal");
    // The real page's own shell content must NOT be present -- proves
    // this is genuinely a different response, not the real shell with
    // extra markup tacked on.
    expect(html).not.toContain("<climbing-grade-pyramid");
  });

  it("never decided (settings row exists, beta_opt_in explicitly NULL) -- same gate shell", async () => {
    const { cookie, userId } = await createAuthedSession({ username: "betanullrow", hostname: "climbinglogbook.com" });
    await setBetaOptIn(userId, null);
    const res = await fetchOwnedRoute("betanullrow", "log", { hostname: "beta.climbinglogbook.com", cookie });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("<beta-opt-in-modal");
  });

  it("redirects to login with no session at all, same as my.x", async () => {
    const res = await fetchOwnedRoute("someone", "log", { hostname: "beta.climbinglogbook.com" });
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("https://climbinglogbook.com/login/");
  });

  it("falls through (404) for a page shape that isn't a real owned route", async () => {
    const { cookie, userId } = await createAuthedSession({ username: "betaunknownpage", hostname: "climbinglogbook.com" });
    await setBetaOptIn(userId, true);
    const res = await fetchOwnedRoute("betaunknownpage", "settings", { hostname: "beta.climbinglogbook.com", cookie });
    expect(res.status).toBe(404);
  });

  it("no public-profile equivalent on beta.x -- a bare :username path 404s regardless of session", async () => {
    const res = await exports.default.fetch("https://beta.climbinglogbook.com/anyone", { redirect: "manual" });
    expect(res.status).toBe(404);
  });
});
