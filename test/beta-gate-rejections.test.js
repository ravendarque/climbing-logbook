// Rejection-path tests for the beta invite/registration gate (#296) -- no
// test in this file ever calls auth.handler(); every test here only
// reaches handleBetaGatedSignUp's own early-return branches. See
// beta-gate.test.js's header comment for why that boundary matters (#379's
// vitest-pool-workers isolate-hang trigger) and why it's split out into
// this separate file rather than combined with the auth.handler()-reaching
// tests there.
import { beforeEach, describe, expect, it } from "vitest";
import { resetAuthTables } from "./support.js";
import { seedInvite, signUp, stubBetaGateFetch } from "./beta-gate-helpers.js";

beforeEach(resetAuthTables);
stubBetaGateFetch();

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

  it("rejects reusing an already-used code", async () => {
    // Seeded already-used directly rather than via a real prior signUp()
    // call -- exercises the identical used_at-guard path (a live prior
    // claim would leave the same used_at set before this request's own
    // SELECT runs), without this file ever reaching auth.handler().
    await seedInvite({ code: "one-shot", used: true });

    const res = await signUp({ code: "one-shot" });
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("INVALID_INVITE_CODE");
  });

  it("rejects an email-pinned code used with a different email", async () => {
    await seedInvite({ code: "pinned-code", email: "expected@example.com" });

    const res = await signUp({ code: "pinned-code", email: "someone-else@example.com", username: "someoneelse" });
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("INVALID_INVITE_CODE");
  });
});
