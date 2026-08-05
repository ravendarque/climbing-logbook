// Exercises the beta invite/registration gate (#296) through the real
// Worker entrypoint. Real D1, not mocked -- see test/apply-migrations.js.
import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { jsonRequest, resetAuthTables } from "./support.js";

beforeEach(resetAuthTables);

async function seedInvite({ code = "test-code", email = null } = {}) {
  await env.LOGBOOK_DB
    .prepare(`INSERT INTO beta_invites (code, email) VALUES (?, ?)`)
    .bind(code, email)
    .run();
}

function signUp(body) {
  return jsonRequest("POST", "/logbook/api/auth/sign-up/email", {
    email: "nix@example.com",
    password: "correct-horse-battery-staple",
    name: "Nix",
    username: "nix",
    ...body,
  });
}

describe("beta gate enabled (BETA_GATE_ENABLED=true, wrangler.jsonc default)", () => {
  it("rejects sign-up with no code", async () => {
    const res = await signUp({ code: undefined });
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("INVITE_CODE_REQUIRED");
  });

  it("rejects sign-up with an unknown code", async () => {
    const res = await signUp({ code: "does-not-exist" });
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("INVALID_INVITE_CODE");
  });

  it("accepts sign-up with a valid unpinned code, and marks it used", async () => {
    await seedInvite({ code: "open-code" });

    const res = await signUp({ code: "open-code" });
    expect(res.status).toBe(200);

    const row = await env.LOGBOOK_DB.prepare(`SELECT * FROM beta_invites WHERE code = ?`).bind("open-code").first();
    expect(row.used_at).not.toBeNull();
    expect(row.email).toBe("nix@example.com");
    expect(row.used_by).not.toBeNull();
  });

  it("rejects reusing an already-used code", async () => {
    await seedInvite({ code: "one-shot" });
    expect((await signUp({ code: "one-shot" })).status).toBe(200);

    const res = await signUp({ code: "one-shot", email: "someone-else@example.com", username: "someoneelse" });
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("INVALID_INVITE_CODE");
  });

  it("rejects an email-pinned code used with a different email", async () => {
    await seedInvite({ code: "pinned-code", email: "expected@example.com" });

    const res = await signUp({ code: "pinned-code", email: "someone-else@example.com", username: "someoneelse" });
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("INVALID_INVITE_CODE");
  });

  it("accepts an email-pinned code used with the matching email", async () => {
    await seedInvite({ code: "pinned-code", email: "nix@example.com" });

    const res = await signUp({ code: "pinned-code" });
    expect(res.status).toBe(200);
  });
});

describe("beta gate disabled", () => {
  const original = env.BETA_GATE_ENABLED;
  beforeEach(() => { env.BETA_GATE_ENABLED = "false"; });
  afterEach(() => { env.BETA_GATE_ENABLED = original; });

  it("allows sign-up with no code at all", async () => {
    const res = await signUp({ code: undefined });
    expect(res.status).toBe(200);
  });
});
