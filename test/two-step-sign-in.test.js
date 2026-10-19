import { env } from "cloudflare:workers";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { BASE_URL, createAuthedSession, fetchJson, jsonRequest as rawJsonRequest, resetAuthTables } from "./support.js";
import { secretFromUri, totp } from "./totp.js";
import { cleanUp } from "../server/lib/cleanup.js";
import { completeDueRecoveries } from "../server/lib/two-step-recovery.js";
import { apexOrigin } from "../server/lib/hosts.js";
import { createLogger } from "../server/lib/log.js";
import { parseAuthSecrets, reencryptTwoStepData } from "../server/lib/auth-secrets.js";

const PASSWORD = "correct-horse-battery-staple";
const ORIGIN = { Origin: BASE_URL };
const jsonRequest = (method, path, body, headers = {}) => rawJsonRequest(method, path, body, { ...ORIGIN, ...headers });
const authPost = (path, headers = {}) => fetchJson(path, { method: "POST", headers: { ...ORIGIN, ...headers } });
const DAY_MS = 24 * 60 * 60 * 1000;

beforeAll(() => {
  env.BETA_GATE_ENABLED = "false";
});
afterAll(() => {
  env.BETA_GATE_ENABLED = "true";
});

let emails;
function captureEmails() {
  emails = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input, init) => {
      const url = typeof input === "string" ? input : input.url;
      if (!url.startsWith("https://api.resend.com/")) throw new Error(`Unexpected fetch to ${url}`);
      const { to, subject, html } = JSON.parse(init.body);
      emails.push({ to, subject, html });
      return new Response(JSON.stringify({ id: "fake" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
}
afterEach(() => vi.unstubAllGlobals());

const cookiesFrom = res =>
  res.headers
    .getSetCookie()
    .map(c => c.split(";")[0])
    .filter(c => !c.endsWith("="))
    .join("; ");

let cookie;
let userId;
let email;
beforeEach(async () => {
  await resetAuthTables();
  ({ cookie, userId } = await createAuthedSession());
  ({ email } = await env.LOGBOOK_DB.prepare(`SELECT email FROM "user" WHERE id = ?`).bind(userId).first());
  captureEmails();
});

async function turnOn() {
  const enable = await jsonRequest("POST", "/-/api/auth/two-factor/enable", { password: PASSWORD }, { Cookie: cookie });
  expect(enable.status).toBe(200);
  const { totpURI, backupCodes } = await enable.json();
  const secret = secretFromUri(totpURI);
  const verify = await jsonRequest(
    "POST",
    "/-/api/auth/two-factor/verify-totp",
    { code: await totp(secret) },
    { Cookie: cookie },
  );
  expect(verify.status).toBe(200);
  cookie = cookiesFrom(verify);
  return { secret, backupCodes };
}

async function signInWithPassword() {
  const res = await jsonRequest("POST", "/-/api/auth/sign-in/email", { email, password: PASSWORD });
  expect(res.status).toBe(200);
  return { body: await res.json(), pending: cookiesFrom(res) };
}

const tokenFrom = html => decodeURIComponent(html.match(/two-step-recovery=([^"&<]+)/)[1]);
const recovery = (action, token) => jsonRequest("POST", `/-/api/auth/two-factor/recovery/${action}`, { token });
const twoFactorRow = () => env.LOGBOOK_DB.prepare(`SELECT * FROM "twoFactor" WHERE "userId" = ?`).bind(userId).first();
const enabledFlag = async () =>
  (await env.LOGBOOK_DB.prepare(`SELECT "twoFactorEnabled" AS on_ FROM "user" WHERE id = ?`).bind(userId).first()).on_;

describe("turning 2FA on (#1436)", () => {
  it("turns on once a code from the app is confirmed, and stores the secret and backup codes encrypted", async () => {
    const { backupCodes } = await turnOn();
    expect(await enabledFlag()).toBe(1);
    const row = await twoFactorRow();
    expect(row.verified).toBe(1);
    expect(backupCodes).toHaveLength(10);
    for (const code of backupCodes) expect(row.backupCodes).not.toContain(code);
  });

  it("needs the password to start", async () => {
    const res = await jsonRequest("POST", "/-/api/auth/two-factor/enable", { password: "wrong" }, { Cookie: cookie });
    expect(res.status).toBe(400);
    expect(await enabledFlag()).toBe(0);
  });
});

describe("logging in with 2FA on (#1436)", () => {
  it("asks for a code after the password, and a code from the app logs in", async () => {
    const { secret } = await turnOn();
    const { body, pending } = await signInWithPassword();
    expect(body).toMatchObject({ twoFactorRedirect: true });
    expect(body.user).toBeUndefined();

    const res = await jsonRequest(
      "POST",
      "/-/api/auth/two-factor/verify-totp",
      { code: await totp(secret) },
      { Cookie: pending },
    );
    expect(res.status).toBe(200);
    expect((await res.json()).user.id).toBe(userId);
  });

  it("logs in with a backup code once, and not twice", async () => {
    const { backupCodes } = await turnOn();
    const first = await signInWithPassword();
    const ok = await jsonRequest(
      "POST",
      "/-/api/auth/two-factor/verify-backup-code",
      { code: backupCodes[0] },
      { Cookie: first.pending },
    );
    expect(ok.status).toBe(200);
    const second = await signInWithPassword();
    const again = await jsonRequest(
      "POST",
      "/-/api/auth/two-factor/verify-backup-code",
      { code: backupCodes[0] },
      { Cookie: second.pending },
    );
    expect(again.status).toBe(401);
  });

  it("refuses a wrong code", async () => {
    await turnOn();
    const { pending } = await signInWithPassword();
    const res = await jsonRequest(
      "POST",
      "/-/api/auth/two-factor/verify-totp",
      { code: "000000" },
      { Cookie: pending },
    );
    expect(res.status).toBe(401);
  });
});

describe("recovering without the device (#1436)", () => {
  it("can only be asked for by someone who has just entered the password", async () => {
    await turnOn();
    const res = await authPost("/-/api/auth/two-factor/recovery/request");
    expect(res.status).toBe(401);
    expect(emails.map(e => e.subject)).not.toContain("Switch off 2FA?");
  });

  it("emails a link; using it starts a 7-day wait, after which 2FA is off", async () => {
    await turnOn();
    const { pending } = await signInWithPassword();
    const asked = await authPost("/-/api/auth/two-factor/recovery/request", { Cookie: pending });
    expect(asked.status).toBe(200);
    expect(emails.at(-1)).toMatchObject({ to: email, subject: "Switch off 2FA?" });
    const token = tokenFrom(emails.at(-1).html);

    expect(await (await recovery("status", token)).json()).toMatchObject({ state: "unstarted" });
    const started = await (await recovery("start", token)).json();
    expect(started.state).toBe("waiting");
    expect(started.effectiveAt - Date.now()).toBeGreaterThan(7 * DAY_MS - 60_000);
    expect(emails.at(-1).subject).toBe("2FA will switch off in 7 days");

    const sender = { sendTwoStepSwitchedOff: vi.fn() };
    expect(await completeDueRecoveries(env, sender, Date.now() + 6 * DAY_MS)).toBe(0);
    expect(await enabledFlag()).toBe(1);
    expect(await completeDueRecoveries(env, sender, started.effectiveAt)).toBe(1);
    expect(await enabledFlag()).toBe(0);
    expect(await twoFactorRow()).toBeNull();
    expect(sender.sendTwoStepSwitchedOff).toHaveBeenCalledWith(
      email,
      expect.stringContaining("/help/two-factor-authentication/"),
    );

    const { body } = await signInWithPassword();
    expect(body.user.id).toBe(userId);
  });

  it("can be cancelled from the email, and then never completes", async () => {
    await turnOn();
    const { pending } = await signInWithPassword();
    await authPost("/-/api/auth/two-factor/recovery/request", { Cookie: pending });
    const token = tokenFrom(emails.at(-1).html);
    const { effectiveAt } = await (await recovery("start", token)).json();

    expect(await (await recovery("cancel", token)).json()).toEqual({ state: "cancelled" });
    expect(emails.at(-1).subject).toBe("2FA stays on");
    expect(await completeDueRecoveries(env, { sendTwoStepSwitchedOff: vi.fn() }, effectiveAt)).toBe(0);
    expect(await enabledFlag()).toBe(1);
    expect(await (await recovery("start", token)).json()).toMatchObject({ state: "cancelled" });
  });

  it("can be cancelled from My account, which also shows it's pending", async () => {
    await turnOn();
    const { pending } = await signInWithPassword();
    await authPost("/-/api/auth/two-factor/recovery/request", { Cookie: pending });
    const { effectiveAt } = await (await recovery("start", tokenFrom(emails.at(-1).html))).json();

    const shown = await fetchJson("/-/api/auth/two-factor/recovery/pending", { headers: { Cookie: cookie } });
    expect(await shown.json()).toEqual({ effectiveAt });
    await jsonRequest("POST", "/-/api/auth/two-factor/recovery/cancel-mine", {}, { Cookie: cookie });
    const after = await fetchJson("/-/api/auth/two-factor/recovery/pending", { headers: { Cookie: cookie } });
    expect(await after.json()).toEqual({ effectiveAt: null });
  });

  it("is cancelled when 2FA is turned off, so a later setup isn't switched off", async () => {
    await turnOn();
    const { pending } = await signInWithPassword();
    await authPost("/-/api/auth/two-factor/recovery/request", { Cookie: pending });
    const { effectiveAt } = await (await recovery("start", tokenFrom(emails.at(-1).html))).json();

    const off = await jsonRequest("POST", "/-/api/auth/two-factor/disable", { password: PASSWORD }, { Cookie: cookie });
    expect(off.status).toBe(200);
    cookie = cookiesFrom(off);
    await turnOn();
    expect(await completeDueRecoveries(env, { sendTwoStepSwitchedOff: vi.fn() }, effectiveAt)).toBe(0);
    expect(await enabledFlag()).toBe(1);
  });

  it("counts towards the address's email limit", async () => {
    await turnOn();
    const statuses = [];
    env.RATE_LIMITING_ENABLED = "true";
    try {
      for (let i = 0; i < 4; i++) {
        const { pending } = await signInWithPassword();
        statuses.push((await authPost("/-/api/auth/two-factor/recovery/request", { Cookie: pending })).status);
      }
    } finally {
      env.RATE_LIMITING_ENABLED = "false";
    }
    expect(statuses).toContain(429);
  });

  it("sends links to the main site, even when asked from the app host", () => {
    expect(apexOrigin("https://my.climbinglogbook.com/-/api/auth/x")).toBe("https://climbinglogbook.com");
    expect(apexOrigin("https://beta.climbinglogbook.com/-/api/auth/x")).toBe("https://climbinglogbook.com");
    expect(apexOrigin("http://localhost:8787/-/api/auth/x")).toBe("http://localhost:8787");
  });

  it("won't start a second wait while one is running", async () => {
    await turnOn();
    const first = await signInWithPassword();
    await authPost("/-/api/auth/two-factor/recovery/request", { Cookie: first.pending });
    await recovery("start", tokenFrom(emails.at(-1).html));
    const second = await signInWithPassword();
    const again = await authPost("/-/api/auth/two-factor/recovery/request", { Cookie: second.pending });
    expect(again.status).toBe(409);
    expect(await again.json()).toMatchObject({ code: "RECOVERY_WAITING" });
  });

  it("won't start from a link more than a day old, or an invented one", async () => {
    await turnOn();
    const { pending } = await signInWithPassword();
    await authPost("/-/api/auth/two-factor/recovery/request", { Cookie: pending });
    const token = tokenFrom(emails.at(-1).html);
    await env.LOGBOOK_DB.prepare(`UPDATE two_step_recoveries SET requested_at = ?`)
      .bind(Date.now() - 2 * DAY_MS)
      .run();
    expect(await (await recovery("start", token)).json()).toMatchObject({ state: "expired" });
    expect(await (await recovery("start", "made-up")).json()).toMatchObject({ state: "invalid" });
  });

  it("cleans up finished requests after 30 days", async () => {
    await turnOn();
    const { pending } = await signInWithPassword();
    await authPost("/-/api/auth/two-factor/recovery/request", { Cookie: pending });
    await cleanUp(env, createLogger({ env }), Date.now() + 31 * DAY_MS);
    expect((await env.LOGBOOK_DB.prepare(`SELECT COUNT(*) AS n FROM two_step_recoveries`).first()).n).toBe(0);
  });
});

describe("rotating the auth secret (#1440)", () => {
  const NEW_SECRET = "a-new-auth-secret-for-rotation-tests-0123456789";
  let legacy;
  beforeEach(async () => {
    legacy = env.BETTER_AUTH_SECRET;
    env.BETTER_AUTH_SECRET = "the-old-auth-secret-before-rotation-0123456789";
    vi.unstubAllGlobals();
    ({ cookie, userId } = await createAuthedSession());
    ({ email } = await env.LOGBOOK_DB.prepare(`SELECT email FROM "user" WHERE id = ?`).bind(userId).first());
    captureEmails();
  });
  afterEach(() => {
    env.BETTER_AUTH_SECRET = legacy;
    delete env.BETTER_AUTH_SECRETS;
  });

  async function logInWithCode(secret) {
    const { body, pending } = await signInWithPassword();
    expect(body).toMatchObject({ twoFactorRedirect: true });
    return jsonRequest("POST", "/-/api/auth/two-factor/verify-totp", { code: await totp(secret) }, { Cookie: pending });
  }

  it("keeps 2FA working through a rotation, and the old secret can go once data is re-encrypted", async () => {
    const { secret } = await turnOn();
    env.BETTER_AUTH_SECRETS = `2:${NEW_SECRET}`;
    expect((await logInWithCode(secret)).status).toBe(200);

    expect(await reencryptTwoStepData(env)).toEqual({ count: 1, failed: 0 });
    const row = await twoFactorRow();
    expect(row.secret.startsWith("$ba$2$")).toBe(true);
    expect(row.backupCodes.startsWith("$ba$2$")).toBe(true);
    expect(await reencryptTwoStepData(env)).toEqual({ count: 0, failed: 0 });

    env.BETTER_AUTH_SECRET = "a-different-value-standing-in-for-the-retired-secret";
    expect((await logInWithCode(secret)).status).toBe(200);
  });

  it("locks two-step users out if the old secret goes before re-encryption, which is why the playbook waits", async () => {
    const { secret } = await turnOn();
    env.BETTER_AUTH_SECRETS = `2:${NEW_SECRET}`;
    env.BETTER_AUTH_SECRET = "a-different-value-standing-in-for-the-retired-secret";
    expect((await logInWithCode(secret)).status).not.toBe(200);
  });

  it("skips a row it can't read rather than stopping, and says so", async () => {
    await turnOn();
    env.BETTER_AUTH_SECRETS = `2:${NEW_SECRET}`;
    env.BETTER_AUTH_SECRET = "a-different-value-standing-in-for-the-retired-secret";
    expect(await reencryptTwoStepData(env)).toEqual({ count: 0, failed: 1 });
  });

  it("does nothing without versioned secrets", async () => {
    await turnOn();
    expect(await reencryptTwoStepData(env)).toEqual({ count: 0, failed: 0 });
  });

  it("refuses a malformed secrets list", () => {
    expect(parseAuthSecrets(`2:${NEW_SECRET},1:${legacy}`).map(s => s.version)).toEqual([2, 1]);
    expect(() => parseAuthSecrets("no-version")).toThrow();
    expect(() => parseAuthSecrets("x:secret")).toThrow();
    expect(() => parseAuthSecrets("3:")).toThrow();
  });
});
