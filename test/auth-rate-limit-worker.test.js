import { env } from "cloudflare:workers";
import { expect, it } from "vitest";
import { jsonRequest } from "./support.js";

it("writes nothing to D1 for auth requests, even with rate limiting on (#1292)", async () => {
  env.RATE_LIMITING_ENABLED = "true";
  try {
    const session = await jsonRequest("GET", "/-/api/auth/get-session", undefined, {
      "cf-connecting-ip": "198.51.100.12",
    });
    expect(session.status).toBe(200);
    await jsonRequest(
      "POST",
      "/-/api/auth/sign-in/email",
      { email: "nobody@example.com", password: "wrong-password" },
      { "cf-connecting-ip": "198.51.100.12" },
    );
    const { n } = await env.LOGBOOK_DB.prepare(
      `SELECT count(*) AS n FROM sqlite_master WHERE name = 'rateLimit'`,
    ).first();
    expect(n).toBe(0);
  } finally {
    env.RATE_LIMITING_ENABLED = "false";
  }
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
