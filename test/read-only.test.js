import { env, exports } from "cloudflare:workers";
import { afterEach, describe, expect, it } from "vitest";

const fetchApp = (path, init) => exports.default.fetch(`https://climbinglogbook.com${path}`, init);

afterEach(() => {
  delete env.READ_ONLY;
});

describe("read-only mode (#1063)", () => {
  it("answers every API write with a 503 that says to try later, before anything else runs", async () => {
    env.READ_ONLY = "true";
    for (const [method, path] of [
      ["POST", "/-/api/entries"],
      ["PUT", "/-/api/entries"],
      ["DELETE", "/-/api/entries?id=x"],
      ["PATCH", "/-/api/settings"],
      ["POST", "/-/api/auth/sign-in/email"],
      ["POST", "/-/api/feedback"],
    ]) {
      const res = await fetchApp(path, { method, headers: { "Content-Type": "application/json" }, body: "{}" });
      expect(res.status, `${method} ${path}`).toBe(503);
      expect(res.headers.get("Retry-After")).toBe("300");
      expect(await res.json()).toMatchObject({ code: "READ_ONLY" });
    }
  });

  it("leaves reads alone", async () => {
    env.READ_ONLY = "true";
    expect((await fetchApp("/-/api/health")).status).toBe(200);
    expect((await fetchApp("/-/api/entries")).status).toBe(401);
  });

  it("is off unless switched on", async () => {
    const res = await fetchApp("/-/api/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(401);
  });
});
