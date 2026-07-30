// src/index.js's routing is a flat sequence of independent
// `pathname === X && method === Y` checks with one shared 404 fallthrough,
// so a route that exists but is called with the wrong method is otherwise
// indistinguishable, at the response level, from a route that doesn't
// exist at all. This proves every known path actually rejects methods it
// doesn't claim to accept -- including PUT on /admin/settings, which used
// to be the accepted method before the PATCH rename (#215).
import { describe, expect, it } from "vitest";
import { fetchJson } from "./support.js";

const ROUTES = {
  "/logbook/api/logbook": ["GET"],
  "/logbook/api/admin/logbook": ["POST", "PUT", "DELETE"],
  "/logbook/api/places": ["GET"],
  "/logbook/api/admin/places": ["POST"],
  "/logbook/api/locations": ["GET"],
  "/logbook/api/admin/locations": ["POST"],
  "/logbook/api/settings": ["GET"],
  "/logbook/api/admin/settings": ["PATCH"],
  "/logbook/api/admin/session": ["GET"],
  "/logbook/api/admin/login": ["GET"],
};

const ALL_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];

const mismatches = Object.entries(ROUTES).flatMap(([path, accepted]) =>
  ALL_METHODS.filter((method) => !accepted.includes(method)).map((method) => [method, path])
);

describe("method routing", () => {
  it.each(mismatches)("rejects %s on %s", async (method, path) => {
    const res = await fetchJson(path, { method });
    expect(res.status).toBe(404);
  });
});
