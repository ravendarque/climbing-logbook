import { env, exports } from "cloudflare:workers";
import { vi } from "vitest";
import { checkUsername } from "../shared/username-policy.js";

export const BASE_URL = "https://example.com";

// D1 rows persist across tests within a file, so reset between auth tests.
const AUTH_TABLES = ["session", "account", "verification", "user"];

export async function resetAuthTables() {
  await env.LOGBOOK_DB.prepare(`DELETE FROM beta_invites`).run();
  for (const table of AUTH_TABLES) {
    await env.LOGBOOK_DB.prepare(`DELETE FROM "${table}"`).run();
  }
}

export function fetchJson(path, init) {
  return exports.default.fetch(`${BASE_URL}${path}`, init);
}

export function jsonRequest(method, path, body, headers = {}) {
  return fetchJson(path, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

// Needs the beta gate off (no invite code); names are redrawn until the policy accepts them.
function randomUsername() {
  for (;;) {
    const name = `user${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`;
    if (checkUsername(name).ok) return name;
  }
}

export async function createAuthedSession({
  email = `user-${crypto.randomUUID()}@example.com`,
  username = randomUsername(),
  hostname,
} = {}) {
  const base = hostname ? `https://${hostname}` : BASE_URL;
  const request = (path, init) => exports.default.fetch(`${base}${path}`, init);

  let capturedHtml;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input, init) => {
      const url = typeof input === "string" ? input : input.url;
      if (url.startsWith("https://api.resend.com/")) {
        capturedHtml = JSON.parse(init.body).html;
        return new Response(JSON.stringify({ id: "fake-resend-id" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.startsWith("https://challenges.cloudflare.com/turnstile/")) {
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      throw new Error(
        `Unexpected fetch to ${url} -- only Resend/Turnstile calls should reach real fetch() during createAuthedSession()`,
      );
    }),
  );

  const signUp = await request("/-/api/auth/sign-up/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password: "correct-horse-battery-staple",
      name: "Test User",
      username,
      turnstileToken: "test-token",
    }),
  });

  if (!signUp.ok)
    throw new Error(`createAuthedSession: sign-up as "${username}" failed (${signUp.status}): ${await signUp.text()}`);
  const token = decodeURIComponent(capturedHtml.match(/token=([^"&<?]+)/)[1]);
  const res = await request(`/-/api/auth/verify-email?token=${token}`);
  const cookie = res.headers.get("set-cookie").split(";")[0];

  vi.unstubAllGlobals();

  const user = await env.LOGBOOK_DB.prepare(`SELECT id FROM "user" WHERE email = ?`).bind(email).first();
  return { cookie, userId: user.id };
}

export async function seedPlace(
  cookie,
  { locationName = "Magic Wood", country = "Switzerland", area = "Sector 1" } = {},
) {
  const locRes = await jsonRequest("POST", "/-/api/locations", { name: locationName, country }, { Cookie: cookie });
  const {
    location: { id: locationId },
  } = await locRes.json();

  const placeRes = await jsonRequest("POST", "/-/api/places", { locationId, area }, { Cookie: cookie });
  const { place } = await placeRes.json();
  return place.id;
}

// New logbooks start private (#1281), so a test about public logbooks makes one public first.
export async function createPublicSession(options) {
  const session = await createAuthedSession(options);
  await env.LOGBOOK_DB.prepare(
    `INSERT INTO settings (user_id, logbook_public) VALUES (?, 1) ON CONFLICT(user_id) DO UPDATE SET logbook_public = 1`,
  )
    .bind(session.userId)
    .run();
  return session;
}
