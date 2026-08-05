// src/index.js's routing is a flat sequence of independent
// `pathname === X && method === Y` checks with one shared 404 fallthrough,
// so a route that exists but is called with the wrong method is otherwise
// indistinguishable, at the response level, from a route that doesn't
// exist at all. This proves every known path actually rejects methods it
// doesn't claim to accept -- including PUT on /admin/settings, which used
// to be the accepted method before the PATCH rename (#215).
//
// The four D1-backed admin paths (#297) now resolve the Better Auth
// session *before* checking method at all, so an unauthenticated request
// 401s regardless of method -- callers can't probe "does this method
// exist" without a session first. That check is covered separately below
// (auth gate takes priority over the not-found fallthrough); the
// authenticated method-mismatch coverage still proves the real 404
// fallthrough underneath it.
import { env } from "cloudflare:workers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAuthedSession, fetchJson, resetAuthTables } from "./support.js";

const PUBLIC_ROUTES = {
  "/logbook/api/logbook": ["GET"],
  "/logbook/api/places": ["GET"],
  "/logbook/api/locations": ["GET"],
  "/logbook/api/settings": ["GET"],
  "/logbook/api/admin/session": ["GET"],
  "/logbook/api/admin/login": ["GET"],
};

const ADMIN_ROUTES = {
  "/logbook/api/admin/logbook": ["POST", "PUT", "DELETE"],
  "/logbook/api/admin/places": ["POST"],
  "/logbook/api/admin/locations": ["POST"],
  "/logbook/api/admin/settings": ["PATCH"],
};

const ALL_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];

function mismatchesFor(routes) {
  return Object.entries(routes).flatMap(([path, accepted]) =>
    ALL_METHODS.filter((method) => !accepted.includes(method)).map((method) => [method, path])
  );
}

describe("method routing (public paths)", () => {
  it.each(mismatchesFor(PUBLIC_ROUTES))("rejects %s on %s", async (method, path) => {
    const res = await fetchJson(path, { method });
    expect(res.status).toBe(404);
  });
});

describe("method routing (admin paths, unauthenticated)", () => {
  // Every method on every admin path, *including* the one it actually
  // accepts -- unauthenticated, the auth gate rejects before method
  // dispatch ever runs, so the "correct" method isn't special-cased here.
  const allMethodsOnAdminPaths = Object.keys(ADMIN_ROUTES).flatMap(path =>
    ALL_METHODS.map(method => [method, path])
  );

  it.each(allMethodsOnAdminPaths)("401s on %s %s without a session", async (method, path) => {
    const res = await fetchJson(path, { method });
    expect(res.status).toBe(401);
  });
});

describe("method routing (admin paths, authenticated)", () => {
  beforeAll(() => { env.BETA_GATE_ENABLED = "false"; });
  afterAll(() => { env.BETA_GATE_ENABLED = "true"; });

  it.each(mismatchesFor(ADMIN_ROUTES))("rejects %s on %s past the auth gate", async (method, path) => {
    await resetAuthTables();
    const { cookie } = await createAuthedSession();
    const res = await fetchJson(path, { method, headers: { Cookie: cookie } });
    expect(res.status).toBe(404);
  });
});
