import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetAuthTables } from "./support.js";
import { seedInvite, signUp, stubBetaGateFetch } from "./beta-gate-helpers.js";
import { handleBetaGatedSignUp } from "../server/lib/beta-gate.js";

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

  it("accepts a pinned code whose email differs only in case, either way round", async () => {
    await seedInvite({ code: "pinned-upper", email: "Nix@Example.com" });
    expect((await signUp({ code: "pinned-upper" })).status).toBe(200);

    await resetAuthTables();
    await seedInvite({ code: "pinned-lower", email: "nix@example.com" });
    expect((await signUp({ code: "pinned-lower", email: "NIX@EXAMPLE.COM" })).status).toBe(200);
  });

  it("stores the email it pins lowercased", async () => {
    await seedInvite({ code: "open-code" });
    await signUp({ code: "open-code", email: "Nix@Example.com" });

    const row = await env.LOGBOOK_DB.prepare(`SELECT email FROM beta_invites WHERE code = ?`).bind("open-code").first();
    expect(row.email).toBe("nix@example.com");
  });

  it("leaves the code unclaimed when the email is already registered", async () => {
    await seedInvite({ code: "first-code" });
    await seedInvite({ code: "second-code" });
    expect((await signUp({ code: "first-code" })).status).toBe(200);

    const duplicate = await signUp({ code: "second-code", username: "nixagain" });
    expect(duplicate.status).toBe(200);

    const row = await env.LOGBOOK_DB.prepare(`SELECT used_at, used_by, email FROM beta_invites WHERE code = ?`)
      .bind("second-code")
      .first();
    expect(row).toEqual({ used_at: null, used_by: null, email: null });
  });

  it("releases the code when the sign-up handler throws", async () => {
    await seedInvite({ code: "thrown" });
    const request = new Request("https://x/-/api/auth/sign-up/email", {
      method: "POST",
      body: JSON.stringify({ code: "thrown", email: "nix@example.com" }),
    });
    const auth = {
      handler: async () => {
        throw new Error("D1 went away");
      },
    };

    await expect(handleBetaGatedSignUp(request, env, auth)).rejects.toThrow("D1 went away");

    const row = await env.LOGBOOK_DB.prepare(`SELECT used_at, email FROM beta_invites WHERE code = ?`)
      .bind("thrown")
      .first();
    expect(row).toEqual({ used_at: null, email: null });
  });

  it("releases the code when sign-up fails for an unrelated reason", async () => {
    await seedInvite({ code: "will-release" });

    const res = await signUp({ code: "will-release", username: "bad-username!" });
    expect(res.ok).toBe(false);

    const row = await env.LOGBOOK_DB.prepare(`SELECT used_at FROM beta_invites WHERE code = ?`)
      .bind("will-release")
      .first();
    expect(row.used_at).toBeNull();

    const retry = await signUp({ code: "will-release", username: "goodusername" });
    expect(retry.status).toBe(200);
  });
});

describe("beta gate disabled", () => {
  const original = env.BETA_GATE_ENABLED;
  beforeEach(() => {
    env.BETA_GATE_ENABLED = "false";
  });
  afterEach(() => {
    env.BETA_GATE_ENABLED = original;
  });

  it("allows sign-up with no code at all", async () => {
    const res = await signUp({ code: undefined });
    expect(res.status).toBe(200);
  });
});
