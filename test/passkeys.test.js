import { env } from "cloudflare:workers";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { BASE_URL, createAuthedSession, fetchJson, jsonRequest, resetAuthTables } from "./support.js";
import { ownedPageUrl, passkeyRpId, requireUserVerified } from "../server/lib/auth.js";

beforeAll(() => {
  env.BETA_GATE_ENABLED = "false";
});
afterAll(() => {
  env.BETA_GATE_ENABLED = "true";
});

describe("passkey settings (#1439)", () => {
  it("registers passkeys for the whole site in production, and for the host anywhere else", () => {
    expect(passkeyRpId("climbinglogbook.com")).toBe("climbinglogbook.com");
    expect(passkeyRpId("my.climbinglogbook.com")).toBe("climbinglogbook.com");
    expect(passkeyRpId("beta.climbinglogbook.com")).toBe("climbinglogbook.com");
    expect(passkeyRpId("my.localhost")).toBe("my.localhost");
    expect(passkeyRpId("pr-1-climbing-logbook-preview.example.workers.dev")).toBe(
      "pr-1-climbing-logbook-preview.example.workers.dev",
    );
  });

  it("links emails to the owner's page on my.", () => {
    expect(ownedPageUrl("https://climbinglogbook.com/-/api/auth/x", "nix", "account/passkeys")).toBe(
      "https://my.climbinglogbook.com/nix/account/passkeys",
    );
    expect(ownedPageUrl("http://localhost:8787/-/api/auth/x", "nix", "account/passkeys")).toBe(
      "http://my.localhost:8787/nix/account/passkeys",
    );
    expect(ownedPageUrl("https://pr-1.example.workers.dev/-/api/auth/x", "nix", "account/passkeys")).toBe(
      "https://pr-1.example.workers.dev/nix/account/passkeys",
    );
  });

  it("refuses a passkey sign-in where the device didn't check it's the owner", () => {
    expect(() => requireUserVerified({ verification: { authenticationInfo: { userVerified: false } } })).toThrow(
      /didn't confirm it's you/,
    );
    expect(() => requireUserVerified({ verification: { authenticationInfo: { userVerified: true } } })).not.toThrow();
  });
});

describe("managing passkeys (#1439)", () => {
  let cookie;
  let userId;
  let emails;
  beforeEach(async () => {
    await resetAuthTables();
    ({ cookie, userId } = await createAuthedSession());
    emails = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input, init) => {
        const url = typeof input === "string" ? input : input.url;
        if (!url.startsWith("https://api.resend.com/")) throw new Error(`Unexpected fetch to ${url}`);
        emails.push(JSON.parse(init.body));
        return new Response(JSON.stringify({ id: "fake" }), { status: 200 });
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  const addRow = () =>
    env.LOGBOOK_DB.prepare(
      `INSERT INTO "passkey" (id, name, "publicKey", "userId", "credentialID", counter, "deviceType", "backedUp", "createdAt")
       VALUES ('pk1', 'My phone', 'cHVibGlj', ?, 'cred1', 0, 'singleDevice', 0, ?)`,
    )
      .bind(userId, new Date().toISOString())
      .run();

  it("lists, renames and removes the owner's passkeys, emailing when one is removed", async () => {
    await addRow();
    const listed = await (
      await fetchJson("/-/api/auth/passkey/list-user-passkeys", { headers: { Cookie: cookie } })
    ).json();
    expect(listed).toEqual([expect.objectContaining({ id: "pk1", name: "My phone" })]);
    expect(JSON.stringify(listed)).not.toContain("cHVibGlj".repeat(2));

    const renamed = await jsonRequest(
      "POST",
      "/-/api/auth/passkey/update-passkey",
      { id: "pk1", name: "Old phone" },
      { Cookie: cookie, Origin: BASE_URL },
    );
    expect(renamed.status).toBe(200);

    const removed = await jsonRequest(
      "POST",
      "/-/api/auth/passkey/delete-passkey",
      { id: "pk1" },
      { Cookie: cookie, Origin: BASE_URL },
    );
    expect(removed.status).toBe(200);
    expect(await env.LOGBOOK_DB.prepare(`SELECT COUNT(*) AS n FROM "passkey"`).first("n")).toBe(0);
    expect(emails.at(-1).subject).toBe("A passkey was removed from your account");
    expect(emails.at(-1).html).toContain("/account/passkeys");
  });

  it("can't touch another user's passkey", async () => {
    await addRow();
    const other = await createAuthedSession();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 200 })),
    );
    const res = await jsonRequest(
      "POST",
      "/-/api/auth/passkey/delete-passkey",
      { id: "pk1" },
      { Cookie: other.cookie, Origin: BASE_URL },
    );
    expect(res.status).not.toBe(200);
    expect(await env.LOGBOOK_DB.prepare(`SELECT COUNT(*) AS n FROM "passkey"`).first("n")).toBe(1);
  });
});
