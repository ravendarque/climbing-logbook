// #347 -- my.<domain>/:username/{log,map,performance}, the authenticated
// owner's own routes. Session's own user id must match the user id the
// URL's :username resolves to, else redirect to login -- the per-user
// equivalent of what Cloudflare Access used to do for the single, global
// /logbook URL. Exercised via the real Worker entrypoint with an explicit
// Host header, same "public HTTP contract" philosophy as
// test/public-profile.test.js.
//
// #857 -- every `src="/logbook/<name>-app.js"` assertion below is a
// regex tolerating an optional trailing `?v=<digits>`, not an exact
// string match: .eleventy.js's own assetVersion appends that query to
// the real built HTML this test reads (via env.ASSETS.fetch(), the
// same file html:build produced), and the value is a genuinely
// non-deterministic build-time timestamp -- an exact match broke the
// instant that query started existing.
import { env, exports } from "cloudflare:workers";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createAuthedSession, resetAuthTables } from "./support.js";
import { SHELL_HEADER, SHELL_PATHS } from "../shared/owner-routes.js";

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
    expect(res.headers.get("Location")).toBe("https://my.climbinglogbook.com/login/?returnTo=%2Fsomeone%2Flog");
  });

  it("redirects to login when logged in as a *different* user", async () => {
    await createAuthedSession({ username: "targetuser", hostname: "climbinglogbook.com" });
    const { cookie: otherCookie } = await createAuthedSession({ username: "differentuser", hostname: "climbinglogbook.com" });
    const res = await fetchOwnedRoute("targetuser", "log", { cookie: otherCookie });
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("https://my.climbinglogbook.com/login/?returnTo=%2Ftargetuser%2Flog");
  });

  it("redirects to login for a username that doesn't exist at all -- same response as a wrong user (anti-enumeration)", async () => {
    const { cookie } = await createAuthedSession({ username: "realuser", hostname: "climbinglogbook.com" });
    const res = await fetchOwnedRoute("nobody-by-this-name", "log", { cookie });
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("https://my.climbinglogbook.com/login/?returnTo=%2Fnobody-by-this-name%2Flog");
  });

  it("looks up the username case-insensitively", async () => {
    const { cookie } = await createAuthedSession({ username: "mixedcaseowner", hostname: "climbinglogbook.com" });
    const res = await fetchOwnedRoute("MixedCaseOwner", "map", { cookie });
    expect(res.status).toBe(200);
  });

  it("accepts all page shapes: log, map, performance, sync, account, account/edit, account/import", async () => {
    const { cookie } = await createAuthedSession({ username: "allpagesuser", hostname: "climbinglogbook.com" });
    for (const page of ["log", "map", "performance", "sync", "account", "account/edit", "account/import"]) {
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
    expect(html).toMatch(/src="\/logbook\/map\-app\.js(\?v=\d+)?"/);
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
    expect(html).toMatch(/src="\/logbook\/performance\-hub\-app\.js(\?v=\d+)?"/);
  });

  it("serves the real static shell for performance/pyramid", async () => {
    const { cookie } = await createAuthedSession({ username: "pyramidshelluser", hostname: "climbinglogbook.com" });
    const res = await fetchOwnedRoute("pyramidshelluser", "performance/pyramid", { cookie });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("<climbing-grade-pyramid");
    expect(html).toMatch(/src="\/logbook\/performance\-pyramid\-app\.js(\?v=\d+)?"/);
  });

  it("serves the real static shell for performance/injury", async () => {
    const { cookie } = await createAuthedSession({ username: "injuryshelluser", hostname: "climbinglogbook.com" });
    const res = await fetchOwnedRoute("injuryshelluser", "performance/injury", { cookie });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('id="injury-log-root"');
    expect(html).toMatch(/src="\/logbook\/performance\-injury\-app\.js(\?v=\d+)?"/);
  });

  it("serves the real static shell for performance/strengths", async () => {
    const { cookie } = await createAuthedSession({ username: "strengthsshelluser", hostname: "climbinglogbook.com" });
    const res = await fetchOwnedRoute("strengthsshelluser", "performance/strengths", { cookie });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('id="strengths-root"');
    expect(html).toMatch(/src="\/logbook\/performance\-strengths\-app\.js(\?v=\d+)?"/);
  });

  it("serves the real static shell for performance/trends", async () => {
    const { cookie } = await createAuthedSession({ username: "trendsshelluser", hostname: "climbinglogbook.com" });
    const res = await fetchOwnedRoute("trendsshelluser", "performance/trends", { cookie });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('id="trends-root"');
    expect(html).toMatch(/src="\/logbook\/performance\-trends\-app\.js(\?v=\d+)?"/);
  });

  it("serves the real static shell for performance/gap", async () => {
    const { cookie } = await createAuthedSession({ username: "gapshelluser", hostname: "climbinglogbook.com" });
    const res = await fetchOwnedRoute("gapshelluser", "performance/gap", { cookie });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('id="gap-root"');
    expect(html).toMatch(/src="\/logbook\/performance\-gap\-app\.js(\?v=\d+)?"/);
  });

  it("serves the real static shell for performance/rpe", async () => {
    const { cookie } = await createAuthedSession({ username: "rpeshelluser", hostname: "climbinglogbook.com" });
    const res = await fetchOwnedRoute("rpeshelluser", "performance/rpe", { cookie });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('id="rpe-root"');
    expect(html).toMatch(/src="\/logbook\/performance\-rpe\-app\.js(\?v=\d+)?"/);
  });

  it("serves the real static shell for log", async () => {
    const { cookie } = await createAuthedSession({ username: "logshelluser", hostname: "climbinglogbook.com" });
    const res = await fetchOwnedRoute("logshelluser", "log", { cookie });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("<climbing-entries-table");
    expect(html).toMatch(/src="\/logbook\/log\-app\.js(\?v=\d+)?"/);
  });

  it("serves the real static shell for account", async () => {
    const { cookie } = await createAuthedSession({ username: "accountshelluser", hostname: "climbinglogbook.com" });
    const res = await fetchOwnedRoute("accountshelluser", "account", { cookie });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("My account");
    expect(html).toMatch(/src="\/logbook\/account\-app\.js(\?v=\d+)?"/);
  });

  it("serves the real static shell for account/edit", async () => {
    const { cookie } = await createAuthedSession({ username: "accounteditshelluser", hostname: "climbinglogbook.com" });
    const res = await fetchOwnedRoute("accounteditshelluser", "account/edit", { cookie });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Edit account details");
    expect(html).toMatch(/src="\/logbook\/account\-edit\-app\.js(\?v=\d+)?"/);
  });

  it("serves the real static shell for account/import", async () => {
    const { cookie } = await createAuthedSession({ username: "accountimportshelluser", hostname: "climbinglogbook.com" });
    const res = await fetchOwnedRoute("accountimportshelluser", "account/import", { cookie });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Import entries");
    expect(html).toMatch(/src="\/logbook\/account\-import\-app\.js(\?v=\d+)?"/);
  });

  it("falls through (404) for a fourth path segment that isn't log/map/performance", async () => {
    const { cookie } = await createAuthedSession({ username: "unknownpageuser", hostname: "climbinglogbook.com" });
    const res = await fetchOwnedRoute("unknownpageuser", "settings", { cookie });
    expect(res.status).toBe(404);
  });

  // #190 -- a real, found regression: the grade-scales page moved off this
  // owned/gated route to a public /help page, but this router's own regex
  // kept matching "performance/grades" for a while after SHELL_PATHS'
  // matching entry was removed, so a request here fell all the way through
  // to `env.ASSETS.fetch(new URL(undefined, request.url))` instead of a
  // clean 404 -- harmless in effect (ASSETS still 404s on a nonexistent
  // "undefined" path) but not the intended, direct 404 this page's own
  // absence should produce. Guards against `grades` (or anything else that
  // no longer has a SHELL_PATHS entry) silently reappearing in the regex.
  it("falls through (404) for the old grade-scales route, now that it's a public /help page instead", async () => {
    const { cookie } = await createAuthedSession({ username: "oldgradesrouteuser", hostname: "climbinglogbook.com" });
    const res = await fetchOwnedRoute("oldgradesrouteuser", "performance/grades", { cookie });
    expect(res.status).toBe(404);
  });

  it("redirects to the same origin's login locally too (local dev)", async () => {
    const res = await exports.default.fetch("https://my.localhost/someone/log", { redirect: "manual" });
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("https://my.localhost/login/?returnTo=%2Fsomeone%2Flog");
  });

  // #955, ADR-0029 -- login stays on the app's own origin (never the apex),
  // and returnTo carries the full path including any query string.
  it("keeps the page's query string in returnTo", async () => {
    const res = await exports.default.fetch("https://my.climbinglogbook.com/someone/performance/rpe?window=90", { redirect: "manual" });
    expect(res.status).toBe(302);
    const location = new URL(res.headers.get("Location"));
    expect(location.origin).toBe("https://my.climbinglogbook.com");
    expect(location.pathname).toBe("/login/");
    expect(location.searchParams.get("returnTo")).toBe("/someone/performance/rpe?window=90");
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
    expect(html).toMatch(/src="\/logbook\/log\-app\.js(\?v=\d+)?"/);
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
    expect(res.headers.get("Location")).toBe("https://beta.climbinglogbook.com/login/?returnTo=%2Fsomeone%2Flog");
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

// #251 -- the three seeded demo accounts' performance pages, reachable
// with no session at all. Deliberately doesn't call createAuthedSession()
// for these usernames -- server/lib/auth.js's registration validator now
// rejects them outright (they're reserved), so there's no real user row to
// create here; the bypass itself needs none either (see
// server/api/owned-routes.js's isDemoPerformancePage -- it serves the
// shell directly, no DB lookup at all).
describe("demo account owned pages (#251)", () => {
  it("serves log/map/performance and every performance sub-page shell with no session", async () => {
    for (const page of ["log", "map", "performance", "performance/pyramid", "performance/injury", "performance/strengths", "performance/trends", "performance/gap", "performance/rpe"]) {
      const res = await fetchOwnedRoute("beginnerdemo", page);
      expect(res.status, `${page} should serve for a demo username with no session`).toBe(200);
    }
  });

  it("works for all three reserved demo usernames", async () => {
    for (const username of ["beginnerdemo", "intermediatedemo", "advanceddemo"]) {
      const res = await fetchOwnedRoute(username, "log");
      expect(res.status).toBe(200);
    }
  });

  it("does NOT bypass sync/account -- those still redirect to login with no session, same as any other username", async () => {
    for (const page of ["sync", "account"]) {
      const res = await fetchOwnedRoute("beginnerdemo", page);
      expect(res.status, `${page} should still be session-gated`).toBe(302);
    }
  });

  it("a real (non-demo) username's log/map/performance pages are still session-gated as normal", async () => {
    for (const page of ["log", "map", "performance"]) {
      const res = await fetchOwnedRoute("notademoaccount", page);
      expect(res.status, `${page} should still be session-gated`).toBe(302);
    }
  });
});

// #959, ADR-0028 -- every owner shell response names its page in
// SHELL_HEADER; nothing else served at an owner URL does. The service
// worker (#947) relies on this to never cache a non-shell response (the
// beta gate page, a login redirect, an error) as a page's shell.
describe("shell identity header (#959)", () => {
  it("marks every SHELL_PATHS page on my.x with its own page key, body unchanged", async () => {
    const { cookie } = await createAuthedSession({ username: "shellheaderuser", hostname: "climbinglogbook.com" });
    for (const [page, shellPath] of Object.entries(SHELL_PATHS)) {
      const res = await fetchOwnedRoute("shellheaderuser", page, { cookie });
      expect(res.status, page).toBe(200);
      expect(res.headers.get(SHELL_HEADER), page).toBe(page);
      const direct = await env.ASSETS.fetch(new Request(new URL(shellPath, "https://my.climbinglogbook.com")));
      expect(await res.text(), `${page} body`).toBe(await direct.text());
      expect(res.headers.get("Content-Type"), `${page} content-type`).toBe(direct.headers.get("Content-Type"));
    }
  });

  it("marks a demo account's shell (no session)", async () => {
    const res = await fetchOwnedRoute("beginnerdemo", "performance/rpe");
    expect(res.status).toBe(200);
    expect(res.headers.get(SHELL_HEADER)).toBe("performance/rpe");
  });

  it("marks the real page on beta.x for an opted-in user", async () => {
    const { cookie, userId } = await createAuthedSession({ username: "betashellheader", hostname: "climbinglogbook.com" });
    await setBetaOptIn(userId, true);
    const res = await fetchOwnedRoute("betashellheader", "map", { hostname: "beta.climbinglogbook.com", cookie });
    expect(res.status).toBe(200);
    expect(res.headers.get(SHELL_HEADER)).toBe("map");
  });

  it("does not mark the beta gate page served at an owner URL", async () => {
    const { cookie, userId } = await createAuthedSession({ username: "betagatenoheader", hostname: "climbinglogbook.com" });
    await setBetaOptIn(userId, null);
    const res = await fetchOwnedRoute("betagatenoheader", "log", { hostname: "beta.climbinglogbook.com", cookie });
    expect(res.status).toBe(200);
    expect(res.headers.get(SHELL_HEADER)).toBeNull();
  });

  it("does not mark the unauthenticated login redirect", async () => {
    const res = await fetchOwnedRoute("someone", "log");
    expect(res.status).toBe(302);
    expect(res.headers.get(SHELL_HEADER)).toBeNull();
  });

  it("does not mark the public profile page", async () => {
    await createAuthedSession({ username: "profilenoheader", hostname: "climbinglogbook.com" });
    const res = await exports.default.fetch("https://my.climbinglogbook.com/profilenoheader", { redirect: "manual" });
    expect(res.headers.get(SHELL_HEADER)).toBeNull();
  });
});
