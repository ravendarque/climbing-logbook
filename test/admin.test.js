import { env, exports } from "cloudflare:workers";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { clearAccessKeyCache } from "../server/lib/access.js";

const TEAM = "team.example.com";
const AUD = "admin-aud";
const KID = "key-1";
const ADMIN = "https://admin.example.com";

let keyPair;
let publicJwk;

const base64Url = bytes =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
const encodeJson = value => base64Url(new TextEncoder().encode(JSON.stringify(value)));

async function signToken(overrides = {}, { kid = KID, key = keyPair.privateKey } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const header = encodeJson({ alg: "RS256", kid, typ: "JWT" });
  const payload = encodeJson({ aud: [AUD], iss: `https://${TEAM}`, exp: now + 600, iat: now, ...overrides });
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(`${header}.${payload}`),
  );
  return `${header}.${payload}.${base64Url(signature)}`;
}

function admin(path, { token, ...init } = {}) {
  const headers = new Headers(init.headers);
  if (token) headers.set("Cf-Access-Jwt-Assertion", token);
  return exports.default.fetch(`${ADMIN}${path}`, { ...init, headers });
}

async function adminJson(path, init) {
  return admin(path, { token: await signToken(), ...init });
}

async function insert(table, row) {
  const columns = Object.keys(row);
  await env.LOGBOOK_DB.prepare(
    `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`,
  )
    .bind(...Object.values(row))
    .run();
}

beforeAll(async () => {
  keyPair = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  );
  publicJwk = { ...(await crypto.subtle.exportKey("jwk", keyPair.publicKey)), kid: KID, alg: "RS256" };
});

beforeEach(async () => {
  env.ACCESS_TEAM_DOMAIN = TEAM;
  env.ACCESS_AUD = AUD;
  delete env.ADMIN_ACCESS_CHECK;
  clearAccessKeyCache();
  vi.stubGlobal(
    "fetch",
    vi.fn(async input => {
      const url = typeof input === "string" ? input : input.url;
      if (url === `https://${TEAM}/cdn-cgi/access/certs`) return Response.json({ keys: [publicJwk] });
      throw new Error(`Unexpected fetch to ${url}`);
    }),
  );
  for (const table of ["issue_reports", "feedback_submissions"]) {
    await env.LOGBOOK_DB.prepare(`DELETE FROM ${table}`).run();
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete env.ACCESS_TEAM_DOMAIN;
  delete env.ACCESS_AUD;
});

describe("the admin host's Access check", () => {
  it("lets a valid Access token through", async () => {
    const res = await adminJson("/-/api/admin/reports");
    expect(res.status).toBe(200);
  });

  it.each([
    ["no token", async () => undefined],
    ["another application's audience", () => signToken({ aud: ["other-app"] })],
    ["another team's issuer", () => signToken({ iss: "https://other.cloudflareaccess.com" })],
    ["an expired token", () => signToken({ exp: Math.floor(Date.now() / 1000) - 3600 })],
    ["an unknown key", () => signToken({}, { kid: "key-2" })],
    ["a tampered payload", async () => (await signToken()).replace(/\.[^.]+\./, `.${encodeJson({ aud: [AUD] })}.`)],
    ["rubbish", async () => "not.a.token"],
  ])("refuses %s", async (_label, makeToken) => {
    const res = await admin("/-/api/admin/reports", { token: await makeToken() });
    expect(res.status).toBe(403);
  });

  it("refuses everything when the audience isn't configured", async () => {
    delete env.ACCESS_AUD;
    const res = await adminJson("/-/api/admin/reports");
    expect(res.status).toBe(403);
  });

  it("is skipped only where the environment switches it off", async () => {
    env.ADMIN_ACCESS_CHECK = "off";
    const res = await admin("/-/api/admin/reports");
    expect(res.status).toBe(200);
  });

  it("guards the pages as well as the API", async () => {
    expect((await admin("/reports")).status).toBe(403);
    const root = await admin("/", { token: await signToken(), redirect: "manual" });
    expect(root.status).toBe(302);
    expect(new URL(root.headers.get("Location")).pathname).toBe("/reports");
  });
});

describe("the admin API on other hosts", () => {
  it("doesn't exist", async () => {
    for (const host of ["https://example.com", "https://my.example.com"]) {
      const res = await exports.default.fetch(`${host}/-/api/admin/reports`, {
        headers: { "Cf-Access-Jwt-Assertion": await signToken() },
      });
      expect(res.status, host).toBe(404);
    }
    expect((await exports.default.fetch("https://example.com/-/admin-app.js")).status).toBe(404);
    expect((await exports.default.fetch("https://example.com/admin/")).status).toBe(404);
  });
});

describe("submissions", () => {
  beforeEach(async () => {
    await insert("issue_reports", { id: "r1", message: "Older", section: "map", created_at: "2026-10-01 10:00:00" });
    await insert("issue_reports", {
      id: "r2",
      message: "Newer",
      contact_email: "climber@example.com",
      source_page: "/log",
      created_at: "2026-10-05 10:00:00",
    });
    await insert("issue_reports", {
      id: "r3",
      message: "Archived",
      created_at: "2026-10-06 10:00:00",
      archived_at: "2026-10-06 11:00:00",
    });
    await insert("feedback_submissions", { id: "f1", message: "Read already", read_at: "2026-10-02 09:00:00" });
  });

  it("lists the active ones newest first, and the archived ones apart", async () => {
    const active = await (await adminJson("/-/api/admin/reports")).json();
    expect(active.submissions.map(s => s.id)).toEqual(["r2", "r1"]);
    expect(active.submissions[0]).toMatchObject({
      message: "Newer",
      contactEmail: "climber@example.com",
      sourcePage: "/log",
      readAt: null,
      archivedAt: null,
      username: null,
    });

    const archived = await (await adminJson("/-/api/admin/reports?archived=1")).json();
    expect(archived.submissions.map(s => s.id)).toEqual(["r3"]);
  });

  it("counts what's unread and still active", async () => {
    expect(await (await adminJson("/-/api/admin/counts")).json()).toEqual({ reports: 2, feedback: 0 });
  });

  it("marks one read and unread, and archives and unarchives it", async () => {
    const patch = body =>
      adminJson("/-/api/admin/reports/r1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

    const read = await (await patch({ read: true })).json();
    expect(read.readAt).toEqual(expect.any(String));
    expect(await (await adminJson("/-/api/admin/counts")).json()).toEqual({ reports: 1, feedback: 0 });
    expect((await (await patch({ read: false })).json()).readAt).toBeNull();

    expect((await (await patch({ archived: true })).json()).archivedAt).toEqual(expect.any(String));
    const active = await (await adminJson("/-/api/admin/reports")).json();
    expect(active.submissions.map(s => s.id)).toEqual(["r2"]);
    expect((await (await patch({ archived: false })).json()).archivedAt).toBeNull();
  });

  it("rejects a change it doesn't understand, and one to a submission that isn't there", async () => {
    const patch = (id, body) =>
      adminJson(`/-/api/admin/feedback/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    expect((await patch("f1", { read: "yes" })).status).toBe(400);
    expect((await patch("f1", {})).status).toBe(400);
    expect((await patch("nope", { read: true })).status).toBe(404);
  });

  it("deletes one for good", async () => {
    expect((await adminJson("/-/api/admin/feedback/f1", { method: "DELETE" })).status).toBe(204);
    expect((await adminJson("/-/api/admin/feedback/f1", { method: "DELETE" })).status).toBe(404);
    expect((await (await adminJson("/-/api/admin/feedback")).json()).submissions).toEqual([]);
  });
});
