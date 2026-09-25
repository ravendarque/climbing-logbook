// server/index.js's resource routing (#992): one table keyed by pathname,
// then method. Every route requires a session for every method it
// accepts, reads included, so no session is a 401, never an empty 200.
// Anonymous reads exist only under /-/api/public/:username/*
// (test/public-data.test.js).
//
// Method is checked before the session, so a method a route doesn't
// accept is a 404 with or without one -- including PUT on settings, which
// was the accepted method before the PATCH rename (#215).
import { env } from "cloudflare:workers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAuthedSession, fetchJson, resetAuthTables } from "./support.js";

const ROUTES = {
  "/-/api/entries": ["GET", "POST", "PUT", "DELETE"],
  "/-/api/entries/import": ["POST"],
  "/-/api/places": ["GET", "POST"],
  "/-/api/locations": ["GET", "POST"],
  "/-/api/settings": ["GET", "PATCH"],
  "/-/api/performance/pyramid": ["GET"],
  "/-/api/performance/injury": ["GET"],
  "/-/api/performance/strengths": ["GET"],
  "/-/api/performance/volume": ["GET"],
  "/-/api/performance/gap": ["GET"],
  "/-/api/performance/rpe": ["GET"],
  "/-/api/map/counts": ["GET"],
};

// Retired by #992: the `logbook` resource name and the admin/ split.
const RETIRED_PATHS = [
  "/-/api/logbook",
  "/-/api/admin/logbook",
  "/-/api/admin/logbook/import",
  "/-/api/admin/places",
  "/-/api/admin/locations",
  "/-/api/admin/settings",
];

const ALL_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];

const accepted = Object.entries(ROUTES).flatMap(([path, methods]) => methods.map(method => [method, path]));
const mismatched = Object.entries(ROUTES).flatMap(([path, methods]) =>
  ALL_METHODS.filter(method => !methods.includes(method)).map(method => [method, path])
);

describe("resource routes without a session", () => {
  it.each(accepted)("401s %s %s", async (method, path) => {
    const res = await fetchJson(path, { method });
    expect(res.status).toBe(401);
  });

  it.each(mismatched)("404s %s %s (method checked first)", async (method, path) => {
    const res = await fetchJson(path, { method });
    expect(res.status).toBe(404);
  });
});

describe("resource routes with a session", () => {
  let cookie;
  beforeAll(async () => {
    env.BETA_GATE_ENABLED = "false";
    await resetAuthTables();
    ({ cookie } = await createAuthedSession());
  });
  afterAll(() => { env.BETA_GATE_ENABLED = "true"; });

  it.each(mismatched)("404s %s %s", async (method, path) => {
    const res = await fetchJson(path, { method, headers: { Cookie: cookie } });
    expect(res.status).toBe(404);
  });

  it.each([
    ["/-/api/entries", "entries"],
    ["/-/api/places", "places"],
    ["/-/api/locations", "locations"],
  ])("GET %s answers the session user's %s", async (path, key) => {
    const res = await fetchJson(path, { headers: { Cookie: cookie } });
    expect(res.status).toBe(200);
    expect(Array.isArray((await res.json())[key])).toBe(true);
  });

  it("GET /-/api/settings answers the defaults for a user who's never changed one", async () => {
    const res = await fetchJson("/-/api/settings", { headers: { Cookie: cookie } });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ athleteMode: false, betaOptIn: false });
  });

  it.each(ALL_METHODS.flatMap(method => RETIRED_PATHS.map(path => [method, path])))("404s %s on the retired %s", async (method, path) => {
    const res = await fetchJson(path, { method, headers: { Cookie: cookie } });
    expect(res.status).toBe(404);
  });
});

// #1000 -- Better Auth's username plugin would answer whether an account
// exists; the router hides it like any unknown route.
describe("username availability endpoint", () => {
  it("404s, so it can't be used to test whether an account exists", async () => {
    const res = await fetchJson("/-/api/auth/is-username-available", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "http://localhost" },
      body: JSON.stringify({ username: "anyone" }),
    });
    expect(res.status).toBe(404);
  });
});
