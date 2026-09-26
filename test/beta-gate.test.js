import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetAuthTables } from "./support.js";
import { seedInvite, signUp, stubBetaGateFetch } from "./beta-gate-helpers.js";

beforeEach(resetAuthTables);
stubBetaGateFetch();

describe("beta gate enabled (BETA_GATE_ENABLED=true, wrangler.jsonc default)", () => {
  it("accepts sign-up with a valid unpinned code, and marks it used", async () => {
    await seedInvite({ code: "open-code" });

    const res = await signUp({ code: "open-code" });
    expect(res.status).toBe(200);

    const row = await env.LOGBOOK_DB.prepare(`SELECT * FROM beta_invites WHERE code = ?`).bind("open-code").first();
    expect(row.used_at).not.toBeNull();
    expect(row.email).toBe("nix@example.com");
    expect(row.used_by).not.toBeNull();
  });

  it("accepts an email-pinned code used with the matching email", async () => {
    await seedInvite({ code: "pinned-code", email: "nix@example.com" });

    const res = await signUp({ code: "pinned-code" });
    expect(res.status).toBe(200);
  });

  it("releases the code when sign-up fails for an unrelated reason", async () => {
    await seedInvite({ code: "will-release" });

    const res = await signUp({ code: "will-release", username: "bad-username!" });
    expect(res.ok).toBe(false);

    const row = await env.LOGBOOK_DB.prepare(`SELECT used_at FROM beta_invites WHERE code = ?`).bind("will-release").first();
    expect(row.used_at).toBeNull();

    const retry = await signUp({ code: "will-release", username: "goodusername" });
    expect(retry.status).toBe(200);
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
