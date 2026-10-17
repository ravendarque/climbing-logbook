import { env, exports } from "cloudflare:workers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RESOURCE_ROUTES } from "../server/routes.js";
import { DEMO_ONLY_RESOURCES, PUBLIC_RESOURCES } from "../server/api/public-data.js";
import { PUBLIC_DATA_PATH } from "../server/lib/route-template.js";
import { SHELL_PATHS } from "../shared/owner-routes.js";
import { CSV_COLUMNS } from "../shared/csv-import.js";
import { TERMS_VERSION } from "../shared/terms.js";
import { PAIN_INJURY } from "../shared/health-consent.js";
import { createAuthedSession, createPublicSession, resetAuthTables } from "./support.js";

// Everything user A owns carries this, so any leak to user B shows up in a response body.
const MARK = "zqmatrixmarker";
const OWNER = "matrixowner";
const PRIVATE = "matrixprivate";
const WINDOW = "?start=2020-01-01&end=2026-12-31";
const API = "https://climbinglogbook.com";

// Sessions here belong to the real host, so API calls go to it too, not the test default.
const fetchJson = (path, init) => exports.default.fetch(`${API}${path}`, init);
const jsonRequest = (method, path, body, headers) =>
  fetchJson(path, { method, headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });

const PAIN = { limb: "hand", side: "left", holdType: "crimp", movementStyle: "static", wallAngle: "overhang" };

let a;
let b;
let ids;

beforeAll(async () => {
  env.BETA_GATE_ENABLED = "false";
  await resetAuthTables();
  a = await createPublicSession({ username: OWNER, hostname: "climbinglogbook.com" });
  b = await createAuthedSession({ username: "matrixother", hostname: "climbinglogbook.com" });
  await createAuthedSession({ username: PRIVATE, hostname: "climbinglogbook.com" });
  await jsonRequest("POST", "/-/api/consent/pain-injury", { version: PAIN_INJURY.version }, { Cookie: a.cookie });

  const asA = (method, path, body) => jsonRequest(method, path, body, { Cookie: a.cookie });
  const { location } = await (
    await asA("POST", "/-/api/locations", { name: `${MARK} Crag`, country: "France" })
  ).json();
  const { place } = await (
    await asA("POST", "/-/api/places", { locationId: location.id, area: `${MARK} Sector` })
  ).json();
  const climb = {
    placeId: place.id,
    type: "boulder",
    status: "send",
    grade: "6B",
    date: "2026-06-01",
    rpe: 70,
    moves: [{ ...PAIN, difficulty: "hardest" }],
    painMoves: [PAIN],
  };
  const { entry } = await (
    await asA("POST", "/-/api/entries", { ...climb, name: `${MARK} Climb`, notes: MARK })
  ).json();
  const { entry: gone } = await (await asA("POST", "/-/api/entries", { ...climb, name: `${MARK} Gone` })).json();
  await fetchJson(`/-/api/entries?id=${gone.id}`, { method: "DELETE", headers: { Cookie: a.cookie } });

  const asB = (method, path, body) => jsonRequest(method, path, body, { Cookie: b.cookie });
  const { location: bLocation } = await (
    await asB("POST", "/-/api/locations", { name: "Other Crag", country: "Spain" })
  ).json();
  const { place: bPlace } = await (
    await asB("POST", "/-/api/places", { locationId: bLocation.id, area: "Other Sector" })
  ).json();

  ids = {
    userId: a.userId,
    entryId: entry.id,
    deletedEntryId: gone.id,
    placeId: place.id,
    locationId: location.id,
    bPlaceId: bPlace.id,
    bLocationId: bLocation.id,
  };
});

afterAll(() => {
  env.BETA_GATE_ENABLED = "true";
});

async function snapshotA() {
  const rows = async (sql, ...binds) =>
    (
      await env.LOGBOOK_DB.prepare(sql)
        .bind(...binds)
        .all()
    ).results;
  return JSON.stringify({
    user: await rows(`SELECT * FROM "user" WHERE id = ?`, a.userId),
    settings: await rows(`SELECT * FROM settings WHERE user_id = ?`, a.userId),
    consents: await rows(`SELECT * FROM consents WHERE user_id = ? ORDER BY id`, a.userId),
    locations: await rows(`SELECT * FROM locations WHERE user_id = ? ORDER BY id`, a.userId),
    places: await rows(`SELECT * FROM places WHERE user_id = ? ORDER BY id`, a.userId),
    entries: await rows(`SELECT * FROM entries WHERE user_id = ? ORDER BY id`, a.userId),
    moves: await rows(
      `SELECT m.* FROM entry_moves m JOIN entries e ON e.id = m.entry_id WHERE e.user_id = ? ORDER BY m.id`,
      a.userId,
    ),
    usage: await rows(`SELECT * FROM account_usage WHERE user_id = ?`, a.userId),
    purgeFloors: await rows(`SELECT * FROM entry_purge_floors WHERE user_id = ?`, a.userId),
    invites: await rows(
      `SELECT * FROM beta_invites WHERE used_by = ? OR created_by = ? ORDER BY code`,
      a.userId,
      a.userId,
    ),
    pain: await rows(
      `SELECT p.* FROM entry_pain_moves p JOIN entries e ON e.id = p.entry_id WHERE e.user_id = ? ORDER BY p.id`,
      a.userId,
    ),
  });
}

const asB = (method, path, body) =>
  body === undefined
    ? fetchJson(path, { method, headers: { Cookie: b.cookie } })
    : jsonRequest(method, path, body, { Cookie: b.cookie });

const climbAt = placeId => ({ placeId, type: "boulder", status: "send", grade: "6A", name: "B's climb" });

// One entry per RESOURCE_ROUTES path and method: user B aimed at user A's ids. A new route without one fails below.
const FIXTURES = {
  "GET /-/api/entries": () => [
    asB("GET", "/-/api/entries"),
    asB("GET", "/-/api/entries?since=0"),
    asB("GET", `/-/api/entries?locationId=${ids.locationId}`),
    asB("GET", "/-/api/entries?limit=500"),
  ],
  "POST /-/api/entries": () => [
    asB("POST", "/-/api/entries", { ...climbAt(ids.bPlaceId), id: ids.entryId }),
    asB("POST", "/-/api/entries", { ...climbAt(ids.bPlaceId), id: ids.deletedEntryId }),
    asB("POST", "/-/api/entries", climbAt(ids.placeId)),
  ],
  "PUT /-/api/entries": () => [
    asB("PUT", "/-/api/entries", { ...climbAt(ids.bPlaceId), id: ids.entryId, painMoves: [] }),
    asB("PUT", "/-/api/entries", { ...climbAt(ids.placeId), id: ids.entryId }),
  ],
  "DELETE /-/api/entries": () => [asB("DELETE", `/-/api/entries?id=${ids.entryId}`)],
  "POST /-/api/entries/import": () => [
    fetchJson("/-/api/entries/import", {
      method: "POST",
      headers: { "Content-Type": "text/csv", Cookie: b.cookie },
      body: `${CSV_COLUMNS.join(",")}\nImported,6A,boulder,send,false,2026-06-02,Imported Crag,Sector,Spain\n`,
    }),
  ],
  "GET /-/api/places": () => [asB("GET", "/-/api/places"), asB("GET", "/-/api/places?since=0")],
  "POST /-/api/places": () => [
    asB("POST", "/-/api/places", { id: ids.placeId, locationId: ids.bLocationId, area: "Taken" }),
    asB("POST", "/-/api/places", { locationId: ids.locationId, area: "Under A's crag" }),
  ],
  "PUT /-/api/places": () => [asB("PUT", "/-/api/places", { id: ids.placeId, area: "Renamed by B" })],
  "DELETE /-/api/places": () => [
    asB("DELETE", `/-/api/places?id=${ids.placeId}`),
    asB("DELETE", `/-/api/places?id=${ids.placeId}&moveTo=${ids.bPlaceId}`),
    asB("DELETE", `/-/api/places?id=${ids.bPlaceId}&moveTo=${ids.placeId}`),
  ],
  "PUT /-/api/locations": () => [
    asB("PUT", "/-/api/locations", { id: ids.locationId, name: "Renamed by B", country: "Spain" }),
  ],
  "DELETE /-/api/locations": () => [
    asB("DELETE", `/-/api/locations?id=${ids.locationId}`),
    asB("DELETE", `/-/api/locations?id=${ids.locationId}&moveTo=${ids.bPlaceId}`),
  ],
  "GET /-/api/locations": () => [asB("GET", "/-/api/locations"), asB("GET", "/-/api/locations?since=0")],
  "POST /-/api/locations": () => [
    asB("POST", "/-/api/locations", { id: ids.locationId, name: "Taken", country: "Spain" }),
  ],
  "GET /-/api/settings": () => [asB("GET", "/-/api/settings")],
  "PATCH /-/api/settings": () => [asB("PATCH", "/-/api/settings", { logbookPublic: false, athleteMode: true })],
  "GET /-/api/performance/pyramid": () => [asB("GET", "/-/api/performance/pyramid")],
  "GET /-/api/performance/injury": () => [asB("GET", "/-/api/performance/injury")],
  "GET /-/api/performance/strengths": () => [
    asB("GET", "/-/api/performance/strengths"),
    asB("GET", "/-/api/performance/strengths?dimension=holdType&value=crimp"),
  ],
  "GET /-/api/performance/volume": () => [asB("GET", `/-/api/performance/volume${WINDOW}`)],
  "GET /-/api/performance/gap": () => [asB("GET", `/-/api/performance/gap${WINDOW}`)],
  "GET /-/api/performance/rpe": () => [asB("GET", `/-/api/performance/rpe${WINDOW}`)],
  "GET /-/api/map/counts": () => [asB("GET", "/-/api/map/counts")],
  "POST /-/api/terms": () => [asB("POST", "/-/api/terms", { version: TERMS_VERSION })],
  "GET /-/api/consent/pain-injury": () => [asB("GET", "/-/api/consent/pain-injury")],
  "POST /-/api/consent/pain-injury": () => [
    asB("POST", "/-/api/consent/pain-injury", { version: PAIN_INJURY.version }),
  ],
  "DELETE /-/api/consent/pain-injury": () => [asB("DELETE", "/-/api/consent/pain-injury")],
};

const ROUTES = Object.entries(RESOURCE_ROUTES).flatMap(([path, methods]) =>
  Object.keys(methods).map(method => `${method} ${path}`),
);

function expectNothingOfA(text, route) {
  for (const secret of [MARK, ids.userId, ids.entryId, ids.deletedEntryId, ids.placeId, ids.locationId]) {
    expect(text, `${route} leaked ${secret === MARK ? "a marked field" : secret}`).not.toContain(secret);
  }
}

describe("authorization matrix: the authenticated API (#1070)", () => {
  it("has a fixture for every route and method in RESOURCE_ROUTES", () => {
    expect(ROUTES.filter(route => !Object.hasOwn(FIXTURES, route))).toEqual([]);
  });

  it.each(ROUTES)("%s needs a session", async route => {
    const [method, path] = route.split(" ");
    const res = await fetchJson(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: method === "GET" ? undefined : "{}",
    });
    expect(res.status).toBe(401);
  });

  it.each(ROUTES)("%s never shows user B anything of user A's, or changes it", async route => {
    const before = await snapshotA();
    for (const res of await Promise.all(FIXTURES[route]())) {
      expect(res.status, route).toBeLessThan(500);
      expectNothingOfA(await res.text(), route);
    }
    expect(await snapshotA(), `${route} changed user A's data`).toBe(before);
  });
});

describe("authorization matrix: public data (#1070)", () => {
  const RESOURCES = [...PUBLIC_RESOURCES, ...DEMO_ONLY_RESOURCES];
  const publicGet = (username, resource, query = "") =>
    exports.default.fetch(`https://my.climbinglogbook.com/-/api/public/${username}/${resource}${query}`);

  it("routes every public resource", () => {
    expect(RESOURCES.filter(resource => !PUBLIC_DATA_PATH.test(`/-/api/public/someone/${resource}`))).toEqual([]);
  });

  it.each(RESOURCES)("%s: a private logbook and a missing one get identical 404s", async resource => {
    const responses = await Promise.all([publicGet(PRIVATE, resource), publicGet("matrixnobodyhere", resource)]);
    const shape = async res => ({
      status: res.status,
      body: await res.text(),
      headers: [...res.headers.entries()].filter(([name]) => name !== "date"),
    });
    const [privateShape, missingShape] = await Promise.all(responses.map(shape));
    expect(privateShape.status).toBe(404);
    expect(privateShape).toEqual(missingShape);
  });

  it.each(DEMO_ONLY_RESOURCES)("%s is demo-only: a public real logbook gets a 404", async resource => {
    expect((await publicGet(OWNER, resource, WINDOW)).status).toBe(404);
  });

  it.each(PUBLIC_RESOURCES)("%s never carries health data or deleted climbs, even with ?since=", async resource => {
    for (const query of ["", "?since=0"]) {
      const res = await publicGet(OWNER, resource, query);
      expect(res.status, `${resource}${query}`).toBe(200);
      const text = await res.text();
      expect(text, `${resource}${query}`).not.toContain("painMoves");
      expect(text, `${resource}${query}`).not.toContain('"limb"');
      expect(text, `${resource}${query}`).not.toContain(ids.deletedEntryId);
    }
  });
});

describe("authorization matrix: owner pages (#1070)", () => {
  const PAGES = Object.keys(SHELL_PATHS);
  const page = (host, username, name, cookie) =>
    exports.default.fetch(`https://${host}/${username}/${name}`, {
      redirect: "manual",
      headers: cookie ? { Cookie: cookie } : {},
    });
  const sameRedirect = async res => ({
    status: res.status,
    location: res.headers.get("Location")?.replace(/returnTo=%2F[^%]+/, "returnTo=%2F:user"),
  });

  it.each(PAGES.flatMap(name => ["my", "beta"].map(host => [host, name])))(
    "%s./:username/%s: someone else's session gets the same as a page that doesn't exist",
    async (host, name) => {
      const hostname = `${host}.climbinglogbook.com`;
      const own = await page(hostname, OWNER, name, a.cookie);
      expect(own.status, "the owner's own session is served the page").toBe(200);
      const [theirs, missing] = await Promise.all([
        page(hostname, OWNER, name, b.cookie),
        page(hostname, "matrixnobodyhere", name, b.cookie),
      ]);
      expect(await sameRedirect(theirs)).toEqual(await sameRedirect(missing));
      expect(theirs.status).toBe(302);
    },
  );
});

// Counts and aggregates carry no marker, so every read must also be unchanged once another user's data is gone.
describe("authorization matrix: reads don't depend on another user's data (#1070)", () => {
  it("every GET route gives user B the same answer after another user's data is deleted", async () => {
    const victim = await createAuthedSession({ username: "matrixvictim", hostname: "climbinglogbook.com" });
    const asVictim = (method, path, body) => jsonRequest(method, path, body, { Cookie: victim.cookie });
    await asVictim("POST", "/-/api/consent/pain-injury", { version: PAIN_INJURY.version });
    const { location } = await (
      await asVictim("POST", "/-/api/locations", { name: "Victim Crag", country: "Italy" })
    ).json();
    const { place } = await (
      await asVictim("POST", "/-/api/places", { locationId: location.id, area: "Victim" })
    ).json();
    for (const [grade, firstAttempt] of [
      ["7A", false],
      ["7C", true],
    ]) {
      const created = await asVictim("POST", "/-/api/entries", {
        placeId: place.id,
        type: "boulder",
        status: "send",
        firstAttempt,
        grade,
        name: "Victim climb",
        date: "2026-06-01",
        rpe: 90,
        attemptsToSend: firstAttempt ? 1 : 6,
        moves: [{ ...PAIN, difficulty: "hardest" }],
        painMoves: [PAIN],
      });
      expect(created.status, "the other user's climb is really created").toBe(201);
    }

    const reads = ROUTES.filter(route => route.startsWith("GET "));
    const answers = async () =>
      Object.fromEntries(
        await Promise.all(
          reads.map(async route => [
            route,
            await Promise.all((await Promise.all(FIXTURES[route]())).map(r => r.text())),
          ]),
        ),
      );
    const withVictim = await answers();
    await env.LOGBOOK_DB.batch(
      [
        `DELETE FROM entry_pain_moves WHERE entry_id IN (SELECT id FROM entries WHERE user_id = ?)`,
        `DELETE FROM entry_moves WHERE entry_id IN (SELECT id FROM entries WHERE user_id = ?)`,
        `DELETE FROM entries WHERE user_id = ?`,
        `DELETE FROM places WHERE user_id = ?`,
        `DELETE FROM locations WHERE user_id = ?`,
        `DELETE FROM consents WHERE user_id = ?`,
      ].map(sql => env.LOGBOOK_DB.prepare(sql).bind(victim.userId)),
    );
    expect(await answers()).toEqual(withVictim);
  });
});
