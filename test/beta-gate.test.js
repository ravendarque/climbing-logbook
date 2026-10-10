import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetAuthTables } from "./support.js";
import { seedInvite, signUp, stubBetaGateFetch } from "./beta-gate-helpers.js";
import { handleSignUp } from "../server/lib/sign-up.js";

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

  it("hands Better Auth the browser's own headers, not just the body (#1072)", async () => {
    await seedInvite({ code: "headers" });
    const request = new Request("https://x/-/api/auth/sign-up/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "cf-connecting-ip": "203.0.113.7",
        Origin: "https://climbinglogbook.com",
        Cookie: "a=b",
      },
      body: JSON.stringify({ code: "headers", email: "nix@example.com", turnstileToken: "t" }),
    });
    let forwarded;
    const auth = {
      handler: async req => {
        forwarded = { headers: Object.fromEntries(req.headers), body: await req.json() };
        return new Response("{}");
      },
    };

    await handleSignUp(request, env, () => auth);

    expect(forwarded.headers).toMatchObject({
      "cf-connecting-ip": "203.0.113.7",
      origin: "https://climbinglogbook.com",
      cookie: "a=b",
    });
    expect(forwarded.body).toEqual({ code: "headers", email: "nix@example.com", turnstileToken: "t" });
  });

  it("rejects a sign-up from another site (#1072)", async () => {
    await seedInvite({ code: "cross-site" });

    const res = await signUp({ code: "cross-site" }, { Origin: "https://evil.example" });

    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("INVALID_ORIGIN");
  });

  it("gives the same answer for an unknown, a used and another email's code (#1073)", async () => {
    await seedInvite({ code: "used-code", used: true });
    await seedInvite({ code: "someone-elses", email: "someone@example.com" });

    const bodies = [];
    for (const code of ["no-such-code", "used-code", "someone-elses"]) {
      const res = await signUp({ code });
      expect(res.status, code).toBe(403);
      bodies.push(await res.text());
    }

    expect(new Set(bodies).size).toBe(1);
  });

  it("never looks a code up without a valid Turnstile token (#1073)", async () => {
    await seedInvite({ code: "real-code" });
    const prepare = vi.spyOn(env.LOGBOOK_DB, "prepare");

    const res = await signUp({ code: "real-code", turnstileToken: undefined });

    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("TURNSTILE_TOKEN_REQUIRED");
    expect(prepare.mock.calls.filter(([sql]) => sql.includes("beta_invites"))).toEqual([]);
    prepare.mockRestore();
  });

  it("checks Turnstile once for a sign-up that succeeds (#1073)", async () => {
    await seedInvite({ code: "once" });

    expect((await signUp({ code: "once" })).status).toBe(200);

    const siteverifyCalls = fetch.mock.calls.filter(([input]) =>
      String(typeof input === "string" ? input : input.url).startsWith("https://challenges.cloudflare.com/"),
    );
    expect(siteverifyCalls).toHaveLength(1);
  });

  it("releases the code when the sign-up handler throws", async () => {
    await seedInvite({ code: "thrown" });
    const request = new Request("https://x/-/api/auth/sign-up/email", {
      method: "POST",
      body: JSON.stringify({ code: "thrown", email: "nix@example.com", turnstileToken: "t" }),
    });
    const auth = {
      handler: async () => {
        throw new Error("D1 went away");
      },
    };

    await expect(handleSignUp(request, env, () => auth)).rejects.toThrow("D1 went away");

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
