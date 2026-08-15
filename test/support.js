// Shared by every test/*.test.js file -- single source of truth for
// request-building and D1/auth-table reset, instead of each file
// reimplementing its own fetch wrapper.
import { env, exports } from "cloudflare:workers";
import { vi } from "vitest";

export const BASE_URL = "https://example.com";

// D1 (#20) is isolated per test file the same way KV used to be (Cloudflare's
// documented behaviour for @cloudflare/vitest-pool-workers), but unlike
// KV -- one shared blob per resource, trivially overwritten -- D1 rows
// accumulate across every it() in a file (e.g. two signups in the same
// file would otherwise collide on a real unique-email constraint), so any
// file with more than one auth test needs this between them. `better-
// auth.session_token` cookies from an earlier test also stop resolving to
// anything once their session row is gone, same as a real logout would do.
const AUTH_TABLES = ["session", "account", "verification", "user"];

// locations/places/entries/settings (#21) all reference user(id) ON
// DELETE CASCADE, so clearing "user" already cascades them away -- no
// separate reset needed for the app-data tables themselves.
export async function resetAuthTables() {
  // beta_invites (#296) references user too -- clear it first, or deleting
  // "user" below fails its FOREIGN KEY constraint against any invite still
  // pointing at a user this call is about to remove (confirmed empirically
  // -- SQLITE_CONSTRAINT_FOREIGNKEY, not a hypothetical).
  await env.LOGBOOK_DB.prepare(`DELETE FROM beta_invites`).run();
  // Delete in dependency order (child rows first) -- session/account both
  // reference user via ON DELETE CASCADE, so this isn't strictly required
  // for correctness, but avoids relying on cascade semantics in a reset
  // helper whose only job is "leave every table empty."
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

// Signs up + verifies a real Better Auth user (#297) and returns a usable
// session cookie -- the fastest real path to an authenticated request for
// tests that aren't themselves testing signup/verification (that's
// test/auth.test.js's job). Stubs the outbound Resend and Turnstile-
// siteverify calls for the duration of this one signup only -- both are
// third-party network boundaries, not this app's own runtime, same
// reasoning as test/email.test.js.
//
// Callers must disable the beta gate for their file (`env.BETA_GATE_ENABLED
// = "false"` in beforeAll/afterAll, matching test/auth.test.js's pattern)
// since this doesn't supply an invite code.
export async function createAuthedSession({
  email = `user-${crypto.randomUUID()}@example.com`,
  username = `user${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`,
  // #468 -- signing up on a real climbinglogbook.com-family hostname
  // (rather than the default example.com) exercises the same
  // crossSubDomainCookies-enabled cookie-naming path a real apex signup
  // goes through in production. Needed by callers (e.g.
  // test/owned-routes.test.js) that reuse the returned cookie against a
  // *different* climbinglogbook.com-family hostname -- example.com isn't
  // a "real domain" for crossSubDomainCookies purposes, so a session
  // created there gets a differently-prefixed cookie name than one
  // created on the real domain family, and the two don't match.
  hostname,
} = {}) {
  const base = hostname ? `https://${hostname}` : BASE_URL;
  const request = (path, init) => exports.default.fetch(`${base}${path}`, init);

  let capturedHtml;
  vi.stubGlobal("fetch", vi.fn(async (input, init) => {
    const url = typeof input === "string" ? input : input.url;
    if (url.startsWith("https://api.resend.com/")) {
      capturedHtml = JSON.parse(init.body).html;
      return new Response(JSON.stringify({ id: "fake-resend-id" }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (url.startsWith("https://challenges.cloudflare.com/turnstile/")) {
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    throw new Error(`Unexpected fetch to ${url} -- only Resend/Turnstile calls should reach real fetch() during createAuthedSession()`);
  }));

  await request("/logbook/api/auth/sign-up/email", {
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

  const token = decodeURIComponent(capturedHtml.match(/token=([^"&<?]+)/)[1]);
  const res = await request(`/logbook/api/auth/verify-email?token=${token}`);
  const cookie = res.headers.get("set-cookie").split(";")[0];

  vi.unstubAllGlobals();

  const user = await env.LOGBOOK_DB.prepare(`SELECT id FROM "user" WHERE email = ?`).bind(email).first();
  return { cookie, userId: user.id };
}

// Creates a real, owned location + place via the actual admin API (#297)
// for tests that need a valid placeId to attach entries to -- exercises
// the real create flow rather than inserting rows directly, matching this
// suite's "public HTTP contract, not module internals" philosophy.
export async function seedPlace(cookie, { locationName = "Magic Wood", country = "Switzerland", area = "Sector 1" } = {}) {
  const locRes = await jsonRequest(
    "POST",
    "/logbook/api/admin/locations",
    { name: locationName, country },
    { Cookie: cookie }
  );
  const { locations } = await locRes.json();
  const locationId = locations.at(-1).id;

  const placeRes = await jsonRequest(
    "POST",
    "/logbook/api/admin/places",
    { locationId, area },
    { Cookie: cookie }
  );
  const { places } = await placeRes.json();
  return places.at(-1).id;
}
