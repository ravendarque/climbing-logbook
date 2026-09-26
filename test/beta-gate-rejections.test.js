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
