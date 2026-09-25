// #984, #982 -- app hosts log in on their own origin (#955) at /-/login/,
// inside the collision-proof /-/ namespace; the apex keeps /login/. Both
// are the same page, served here through the real Worker entrypoint.
import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

const get = (url, init) => exports.default.fetch(url, { redirect: "manual", ...init });

describe("/-/login/ on app hosts (#984)", () => {
  it.each(["my.climbinglogbook.com", "beta.climbinglogbook.com"])("serves the login page on %s", async host => {
    const res = await get(`https://${host}/-/login/?returnTo=%2Fraven%2Flog`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('id="login-submit-btn"');
    // Absolute references, so the page works at /-/login/ as well as /login/.
    expect(html).toContain('src="/-/login/login.js"');
    expect(html).not.toMatch(/(src|href)="\.\.?\//);
  });

  it("adds the trailing slash, keeping the query", async () => {
    const res = await get("https://my.climbinglogbook.com/-/login?returnTo=%2Fraven%2Flog");
    expect(res.status).toBe(301);
    expect(res.headers.get("Location")).toBe("https://my.climbinglogbook.com/-/login/?returnTo=%2Fraven%2Flog");
  });

  it("only answers GET and HEAD", async () => {
    const res = await get("https://my.climbinglogbook.com/-/login/", { method: "POST" });
    expect(res.status).toBe(404);
  });
});
