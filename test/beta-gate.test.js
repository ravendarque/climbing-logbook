// Exercises the beta invite/registration gate (#296) through the real
// Worker entrypoint. Real D1, not mocked -- see test/apply-migrations.js.
//
// Split from a single file into this one (every test here reaches
// auth.handler()) and test/beta-gate-rejections.test.js (no test there
// ever does) after #379 traced a reproducible vitest-pool-workers-only
// hang: a test that does a D1 query and then returns early *without*
// calling auth.handler() appears to leave that file's isolate in a state
// where a LATER test's real auth.handler() call hangs indefinitely (20s
// Vitest timeout). Reproduced reliably in isolation across ~15 minimal
// variations; NOT reproduced by sending the identical sequence of requests
// over real HTTP to a running `wrangler dev` server (curl, 2026-08-11) --
// wrangler dev reuses the same workerd isolate across those sequential
// requests too (the same way a real Worker reuses an isolate across
// production requests), and it never hung there. That rules this out as a
// real request-handling bug and points at something specific to
// vitest-pool-workers' own test-runner-to-workerd bridge.
// @cloudflare/vitest-pool-workers gives each test *file* its own fresh
// isolate, so keeping every early-return-only test in a different file
// than every auth.handler()-reaching test sidesteps the trigger entirely
// without needing to fully chase down the workerd-level mechanism. Don't
// add a test to THIS file that does a D1 query and returns without calling
// signUp() -- that reintroduces the same shape in a new file. (Tracked
// upstream: reported against @cloudflare/vitest-pool-workers -- see #379.)
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

  // The actual #379 regression: a code was being permanently burned even
  // when the signup it was claimed for never completed, because the old
  // hooks.before-based release logic couldn't see a later plugin
  // before-hook's own failure (see server/lib/beta-gate.js's header comment).
  // An invalid username format is exactly that -- a failure inside the
  // username plugin's own before-hook, not this app's code.
  it("releases the code when sign-up fails for an unrelated reason", async () => {
    await seedInvite({ code: "will-release" });

    const res = await signUp({ code: "will-release", username: "bad-username!" });
    expect(res.ok).toBe(false);

    const row = await env.LOGBOOK_DB.prepare(`SELECT used_at FROM beta_invites WHERE code = ?`).bind("will-release").first();
    expect(row.used_at).toBeNull();

    // Same code, now with a valid username, succeeds -- proving the code
    // really was released, not just left unclaimed by coincidence.
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
