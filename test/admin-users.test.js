import { env, exports } from "cloudflare:workers";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { BASE_URL, createAuthedSession, fetchJson, jsonRequest, resetAuthTables, seedPlace } from "./support.js";

const ADMIN = "https://admin.example.com";
const PASSWORD = "correct-horse-battery-staple";

function admin(path, init) {
  return exports.default.fetch(`${ADMIN}${path}`, init);
}

function act(userId, action, body) {
  return admin(`/-/api/admin/users/${userId}/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function stubOutsideCalls() {
  let capturedHtml;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input, init) => {
      const url = typeof input === "string" ? input : input.url;
      if (url.startsWith("https://api.resend.com/")) {
        capturedHtml = JSON.parse(init.body).html;
        return Response.json({ id: "fake-resend-id" });
      }
      if (url.startsWith("https://challenges.cloudflare.com/turnstile/")) return Response.json({ success: true });
      throw new Error(`Unexpected fetch to ${url}`);
    }),
  );
  return () => capturedHtml;
}

function signIn(email) {
  stubOutsideCalls();
  return jsonRequest("POST", "/-/api/auth/sign-in/email", { email, password: PASSWORD, turnstileToken: "test-token" });
}

function signUp(email, username) {
  stubOutsideCalls();
  return jsonRequest("POST", "/-/api/auth/sign-up/email", {
    email,
    password: PASSWORD,
    name: "Test User",
    username,
    turnstileToken: "test-token",
  });
}

async function newUser() {
  const email = `user-${crypto.randomUUID()}@example.com`;
  const { cookie, userId } = await createAuthedSession({ email });
  const { username } = await env.LOGBOOK_DB.prepare(`SELECT username FROM "user" WHERE id = ?`).bind(userId).first();
  return { email, cookie, userId, username };
}

async function auditActions() {
  const { entries } = await (await admin("/-/api/admin/audit")).json();
  return entries.map(entry => `${entry.action} ${entry.username}`);
}

beforeAll(() => {
  env.BETA_GATE_ENABLED = "false";
  env.ADMIN_ACCESS_CHECK = "off";
});
afterAll(() => {
  env.BETA_GATE_ENABLED = "true";
  delete env.ADMIN_ACCESS_CHECK;
});

beforeEach(async () => {
  await resetAuthTables();
  for (const table of ["account_suspensions", "banned_identities", "admin_audit_log", "issue_reports", "rate_limits"]) {
    await env.LOGBOOK_DB.prepare(`DELETE FROM ${table}`).run();
  }
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the user list", () => {
  it("lists accounts newest first with their email, climbs, visibility and status, and searches them", async () => {
    const first = await newUser();
    const second = await newUser();
    await seedPlace(second.cookie);

    const { users } = await (await admin("/-/api/admin/users")).json();
    expect(users.map(user => user.id)).toEqual([second.userId, first.userId]);
    expect(users[1]).toMatchObject({
      username: first.username,
      email: first.email,
      climbs: 0,
      logbookPublic: true,
      isDemo: false,
      suspended: false,
    });
    expect(users[1].lastSeenAt).toEqual(expect.any(String));

    const found = await (await admin(`/-/api/admin/users?q=${first.username.toUpperCase()}`)).json();
    expect(found.users.map(user => user.id)).toEqual([first.userId]);
    const none = await (await admin("/-/api/admin/users?q=%25")).json();
    expect(none.users).toEqual([]);
  });
});

describe("suspending", () => {
  it("signs them out, stops them signing in, hides their public logbook, and is undone by unsuspending", async () => {
    const user = await newUser();

    const res = await act(user.userId, "suspend");
    expect(res.status).toBe(200);
    expect((await res.json()).suspended).toBe(true);

    expect((await fetchJson("/-/api/settings", { headers: { Cookie: user.cookie } })).status).toBe(401);
    const refused = await signIn(user.email);
    expect(refused.status).toBe(403);
    expect((await refused.json()).code).toBe("ACCOUNT_SUSPENDED");
    expect((await fetchJson(`/-/api/public/${user.username}/entries`)).status).toBe(404);

    expect((await act(user.userId, "unsuspend")).status).toBe(200);
    expect((await signIn(user.email)).status).toBe(200);
    expect((await fetchJson(`/-/api/public/${user.username}/entries`)).status).toBe(200);

    expect(await auditActions()).toEqual([`unsuspend ${user.username}`, `suspend ${user.username}`]);
  });
});

describe("deleting", () => {
  it("needs the username repeated", async () => {
    const user = await newUser();
    expect((await act(user.userId, "delete")).status).toBe(400);
    expect((await act(user.userId, "delete", { confirm: "someone-else" })).status).toBe(400);
    expect((await admin(`/-/api/admin/users?q=${user.username}`).then(r => r.json())).users).toHaveLength(1);
  });

  it("removes the account and everything in it, keeps their reports, and logs it", async () => {
    const user = await newUser();
    await seedPlace(user.cookie);
    await env.LOGBOOK_DB.prepare(
      `INSERT INTO beta_invites (code, used_by, used_at) VALUES ('code-1', ?, datetime('now'))`,
    )
      .bind(user.userId)
      .run();
    await env.LOGBOOK_DB.prepare(`INSERT INTO issue_reports (id, message, user_id) VALUES ('r1', 'Hello', ?)`)
      .bind(user.userId)
      .run();

    expect((await act(user.userId, "delete", { confirm: user.username.toUpperCase() })).status).toBe(204);

    for (const table of ["user", "places", "locations", "settings", "session", "account"]) {
      const column = table === "user" ? "id" : ["session", "account"].includes(table) ? "userId" : "user_id";
      const row = await env.LOGBOOK_DB.prepare(`SELECT count(*) AS n FROM "${table}" WHERE ${column} = ?`)
        .bind(user.userId)
        .first();
      expect(row.n, table).toBe(0);
    }
    const report = await env.LOGBOOK_DB.prepare(`SELECT user_id FROM issue_reports WHERE id = 'r1'`).first();
    expect(report.user_id).toBeNull();
    expect(await auditActions()).toEqual([`delete ${user.username}`]);
    expect((await act(user.userId, "suspend")).status).toBe(404);
  });
});

describe("banning", () => {
  it("deletes the account and keeps its email and username from ever registering again", async () => {
    const user = await newUser();
    expect((await act(user.userId, "ban", { confirm: user.username })).status).toBe(204);
    expect(await auditActions()).toEqual([`ban ${user.username}`]);

    // Sign-up's generic reply, as for an email that's already registered, and no account.
    const sameEmail = await signUp(user.email.toUpperCase(), "freshname123");
    expect(sameEmail.status).toBe(200);
    const created = await env.LOGBOOK_DB.prepare(`SELECT count(*) AS n FROM "user" WHERE email = ?`)
      .bind(user.email.toLowerCase())
      .first();
    expect(created.n).toBe(0);

    const sameUsername = await signUp(`other-${crypto.randomUUID()}@example.com`, user.username);
    expect(sameUsername.status).toBe(422);
    expect((await sameUsername.json()).code).toBe("INVALID_USERNAME");
  });

  it("stops someone else changing their username to a banned one", async () => {
    const banned = await newUser();
    await act(banned.userId, "ban", { confirm: banned.username });
    const other = await newUser();

    stubOutsideCalls();
    const res = await jsonRequest(
      "POST",
      "/-/api/auth/update-user",
      { username: banned.username },
      { Cookie: other.cookie, Origin: BASE_URL },
    );
    expect(res.status).toBe(422);
    expect((await res.json()).message).toBe("That username isn't available. Try another.");
  });
});

describe("guards", () => {
  it("leaves the demo accounts alone, and knows only its own actions", async () => {
    const user = await newUser();
    await env.LOGBOOK_DB.prepare(
      `INSERT INTO settings (user_id, is_demo) VALUES (?, 1) ON CONFLICT(user_id) DO UPDATE SET is_demo = 1`,
    )
      .bind(user.userId)
      .run();
    expect((await act(user.userId, "suspend")).status).toBe(409);
    expect((await act(user.userId, "promote")).status).toBe(404);
    expect((await act("no-such-user", "suspend")).status).toBe(404);
    expect((await admin(`/-/api/admin/users/${user.userId}/suspend`)).status).toBe(404);
  });
});
