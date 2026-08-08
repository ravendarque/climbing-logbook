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
  it("serves the (placeholder) page when the session's own username matches the URL", async () => {
    const { cookie } = await createAuthedSession({ username: "ownerofthis" });
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
    await createAuthedSession({ username: "targetuser" });
    const { cookie: otherCookie } = await createAuthedSession({ username: "differentuser" });
    const res = await fetchOwnedRoute("targetuser", "log", { cookie: otherCookie });
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("https://climbinglogbook.com/login/");
  });

  it("redirects to login for a username that doesn't exist at all -- same response as a wrong user (anti-enumeration)", async () => {
    const { cookie } = await createAuthedSession({ username: "realuser" });
    const res = await fetchOwnedRoute("nobody-by-this-name", "log", { cookie });
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("https://climbinglogbook.com/login/");
  });

  it("looks up the username case-insensitively", async () => {
    const { cookie } = await createAuthedSession({ username: "mixedcaseowner" });
    const res = await fetchOwnedRoute("MixedCaseOwner", "map", { cookie });
    expect(res.status).toBe(200);
  });

  it("accepts all three page shapes: log, map, performance", async () => {
    const { cookie } = await createAuthedSession({ username: "allpagesuser" });
    for (const page of ["log", "map", "performance"]) {
      const res = await fetchOwnedRoute("allpagesuser", page, { cookie });
      expect(res.status).toBe(200);
    }
  });

  // #348 -- map is the first page with a real shell (fetched via the
  // ASSETS binding, see src/api/owned-routes.js's SHELL_PATHS); log and
  // performance still get #347's original placeholder until their own
  // follow-up PRs land. Asserting the real shell's actual content here
  // (not just a 200, which the test above already covers) is what would
  // have caught the shell/bundle wiring being wrong even though the
  // auth decision itself was right.
  it("serves the real static shell for map, not the placeholder", async () => {
    const { cookie } = await createAuthedSession({ username: "mapshelluser" });
    const res = await fetchOwnedRoute("mapshelluser", "map", { cookie });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("<climbing-tab-bar");
    expect(html).toContain('src="/logbook/map-app.js"');
    expect(html).not.toContain("coming soon");
  });

  it("still serves the #347 placeholder for log and performance (no shell built yet)", async () => {
    const { cookie } = await createAuthedSession({ username: "placeholderuser" });
    for (const page of ["log", "performance"]) {
      const res = await fetchOwnedRoute("placeholderuser", page, { cookie });
      expect(res.status).toBe(200);
      expect(await res.text()).toContain("coming soon");
    }
  });

  it("falls through (404) for a fourth path segment that isn't log/map/performance", async () => {
    const { cookie } = await createAuthedSession({ username: "unknownpageuser" });
    const res = await fetchOwnedRoute("unknownpageuser", "settings", { cookie });
    expect(res.status).toBe(404);
  });

  it("redirects same-origin on hostnames without a real climbinglogbook.com apex (local dev/PR previews)", async () => {
    const res = await exports.default.fetch("https://my.example.com/someone/log", { redirect: "manual" });
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("https://my.example.com/login/");
  });
});
