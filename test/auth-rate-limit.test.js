import { describe, expect, it, vi } from "vitest";
import { limitAuthRequest } from "../server/lib/auth-rate-limit.js";

function envWith(success) {
  return { RATE_LIMITING_ENABLED: "true", AUTH_RATE_LIMITER: { limit: vi.fn(async () => ({ success })) } };
}
const post = path =>
  new Request(`https://climbinglogbook.com${path}`, { method: "POST", headers: { "cf-connecting-ip": "203.0.113.7" } });

describe("limitAuthRequest (#1292)", () => {
  it("counts each auth POST by IP and path, and lets it through while under the limit", async () => {
    const env = envWith(true);
    expect(await limitAuthRequest(post("/-/api/auth/sign-in/email"), env)).toBeNull();
    expect(env.AUTH_RATE_LIMITER.limit).toHaveBeenCalledWith({ key: "203.0.113.7:/-/api/auth/sign-in/email" });
  });

  it("answers 429 once over the limit", async () => {
    const res = await limitAuthRequest(post("/-/api/auth/sign-in/email"), envWith(false));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("60");
    expect((await res.json()).code).toBe("RATE_LIMITED");
  });

  it("never counts a read, such as the session check", async () => {
    const env = envWith(false);
    const res = await limitAuthRequest(new Request("https://climbinglogbook.com/-/api/auth/get-session"), env);
    expect(res).toBeNull();
    expect(env.AUTH_RATE_LIMITER.limit).not.toHaveBeenCalled();
  });

  it("does nothing where rate limiting is off", async () => {
    const env = { ...envWith(false), RATE_LIMITING_ENABLED: "false" };
    expect(await limitAuthRequest(post("/-/api/auth/sign-in/email"), env)).toBeNull();
    expect(env.AUTH_RATE_LIMITER.limit).not.toHaveBeenCalled();
  });
});
