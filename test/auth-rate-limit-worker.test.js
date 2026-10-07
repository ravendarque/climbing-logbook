import { env } from "cloudflare:workers";
import { expect, it } from "vitest";
import { jsonRequest } from "./support.js";

it("answers a session check with Better Auth's rate-limit table gone, so it no longer writes one (#1292)", async () => {
  const before = await env.LOGBOOK_DB.prepare(
    `SELECT count(*) AS n FROM sqlite_master WHERE name = 'rateLimit'`,
  ).first();
  expect(before.n).toBe(0);
  const res = await jsonRequest("GET", "/-/api/auth/get-session");
  expect(res.status).toBe(200);
});

it("turns away the eleventh sign-in attempt in a minute from one IP, through the real binding", async () => {
  env.RATE_LIMITING_ENABLED = "true";
  try {
    const statuses = [];
    for (let i = 0; i < 11; i++) {
      const res = await jsonRequest(
        "POST",
        "/-/api/auth/sign-in/email",
        { email: "nobody@example.com", password: "wrong-password" },
        { "cf-connecting-ip": "198.51.100.11" },
      );
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 10)).not.toContain(429);
    expect(statuses[10]).toBe(429);
  } finally {
    env.RATE_LIMITING_ENABLED = "false";
  }
});
