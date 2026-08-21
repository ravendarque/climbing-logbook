// #413 (Tier 2 follow-up to #407) -- shared Playwright API-mocking
// scaffolding for the four "harness" fixture pages (e2e/fixtures/
// {log,map,performance,profile}-harness.html, verbatim copies of the
// real public/{log,map,performance,profile}/index.html shells, served
// from a path #407's run_worker_first fix doesn't block). Each harness
// loads the REAL, unmodified compiled bundle (client/log-main.js etc.,
// via /logbook/log-app.js) -- this file's job is only to fake the
// /logbook/api/* responses that bundle's own boot() sequence fetches,
// so the real composition-root wiring (discipline switching + settings
// persistence, add/delete an entry, notes-overlay Escape-close, the
// public profile page's own read-only rendering) can be exercised in a
// real browser without needing the my.<domain> session/visibility gate
// at all -- see e2e/component-harnesses.spec.js's own header comment for
// why that gate can't be reached from Playwright locally in the first
// place.
//
// Mutates in-memory copies of the seeded entries/places/locations/
// settings on every admin write and serves them back out, so a test that
// adds an entry then re-reads the list sees its own write reflected --
// same "fake but stateful for the test's own duration" contract a real
// backend would give, without actually hitting one.
const EMPTY_PYRAMID = { top4: [], lower: [], hasSends: false, promotedGrade: null };

export async function mockApi(page, {
  entries = [], places = [], locations = [], settings = { athleteMode: false, activeDiscipline: "boulder", logbookPublic: true },
  loggedIn = true, username = "fixtureuser", email = "fixtureuser@example.com",
  // #111 -- server/api/performance.js's own computed shape, not raw
  // entries -- mock-api.js doesn't replicate the real aggregation logic
  // (that's shared/pyramid-stats.js's own job, covered directly by
  // test/shared/pyramid-stats.test.js); a test that needs a real pyramid
  // supplies the already-split result it expects to see rendered.
  pyramidData = { boulder: EMPTY_PYRAMID, lead: EMPTY_PYRAMID },
} = {}) {
  let _entries = [...entries];
  let _places = [...places];
  let _locations = [...locations];
  let _settings = { ...settings };

  // Fresh, isolated localStorage per test -- these harness pages share an
  // origin with every other page in the app (including real ones), so
  // without this a prior test's offline-queue/cache writes could leak in.
  await page.addInitScript(() => localStorage.clear());

  await page.route("**/logbook/api/auth/get-session", route =>
    route.fulfill({ json: loggedIn ? { session: { id: "s1" }, user: { id: "u1", username, email } } : null }));

  // #302 -- canned success responses matching Better Auth's own real
  // response shapes (confirmed against the installed source), not
  // exercising Better Auth itself -- e2e/account-edit-page.spec.js's job
  // is proving client/account-edit-main.js's own wiring (view/form
  // toggle, request, display update), same "fake but stateful enough for
  // the test's own duration" scope as every other route here.
  await page.route("**/logbook/api/auth/update-user", route => route.fulfill({ json: { status: true } }));
  await page.route("**/logbook/api/auth/change-password", route => route.fulfill({ json: { status: true, user: { id: "u1", email } } }));
  await page.route("**/logbook/api/auth/change-email", route => route.fulfill({ json: { status: true } }));

  await page.route("**/logbook/api/logbook", route => route.fulfill({ json: { entries: _entries } }));
  // #111 -- /log's own initial per-location-capped load. Mirrors server/
  // api/logbook.js's handleGetInitial closely enough for these small
  // fixture datasets (fixed array order standing in for created_at
  // ordering -- none of these tests seed enough entries per location for
  // that distinction to matter): caps each location at PAGE_SIZE and
  // reports every location's true total, computed fresh from the current
  // _entries/_places on every request the same way the plain /logbook
  // route above already does, so a test that POSTs a new entry then
  // reloads still sees it.
  await page.route("**/logbook/api/logbook/initial", route => {
    const PAGE_SIZE = 20;
    const byLocation = new Map();
    for (const entry of _entries) {
      const locationId = _places.find(p => p.id === entry.placeId)?.locationId;
      if (!byLocation.has(locationId)) byLocation.set(locationId, []);
      byLocation.get(locationId).push(entry);
    }
    const locationCounts = {};
    const initialEntries = [];
    for (const [locationId, list] of byLocation) {
      locationCounts[locationId] = list.length;
      initialEntries.push(...list.slice(0, PAGE_SIZE));
    }
    return route.fulfill({ json: { entries: initialEntries, locationCounts } });
  });
  await page.route("**/logbook/api/places", route => route.fulfill({ json: { places: _places } }));
  await page.route("**/logbook/api/locations", route => route.fulfill({ json: { locations: _locations } }));
  await page.route("**/logbook/api/settings", route => route.fulfill({ json: _settings }));
  await page.route("**/logbook/api/performance/pyramid", route => route.fulfill({ json: pyramidData }));

  // Path-scoped by :username (server/api/public-data.js's own route shape)
  // -- glob-wildcarded since the harness's own synthetic USERNAME (parsed
  // client-side from location.pathname) doesn't matter for what's being
  // tested here.
  await page.route("**/logbook/api/public/*/logbook", route => route.fulfill({ json: { entries: _entries } }));
  await page.route("**/logbook/api/public/*/places", route => route.fulfill({ json: { places: _places } }));
  await page.route("**/logbook/api/public/*/locations", route => route.fulfill({ json: { locations: _locations } }));

  await page.route("**/logbook/api/admin/settings", async route => {
    if (route.request().method() !== "PATCH") return route.continue();
    _settings = { ..._settings, ...route.request().postDataJSON() };
    return route.fulfill({ json: _settings });
  });

  await page.route("**/logbook/api/admin/logbook", async route => {
    const method = route.request().method();
    if (method === "POST") {
      _entries = [..._entries, route.request().postDataJSON()];
      return route.fulfill({ status: 201, json: { entries: _entries } });
    }
    if (method === "PUT") {
      const body = route.request().postDataJSON();
      _entries = _entries.map(e => (e.id === body.id ? body : e));
      return route.fulfill({ json: { entries: _entries } });
    }
    if (method === "DELETE") {
      const id = new URL(route.request().url()).searchParams.get("id");
      _entries = _entries.filter(e => e.id !== id);
      return route.fulfill({ json: { entries: _entries } });
    }
    return route.continue();
  });

  // #224 -- the client sends the raw CSV body as-is (text/csv, not JSON),
  // so this fakes just enough of server/api/logbook-import.js's own
  // contract (a row count and an appended entries array) for
  // e2e/account-import-page.spec.js to prove the client's own wiring
  // (file read, request, success/error panel toggling) -- the real
  // parsing/validation/resolution logic is Vitest's job
  // (test/logbook-import.test.js), not re-tested here.
  await page.route("**/logbook/api/admin/logbook/import", async route => {
    if (route.request().method() !== "POST") return route.continue();
    const rows = (route.request().postData() || "").trim().split("\n").slice(1).filter(Boolean);
    _entries = [..._entries, ...rows.map((_, i) => ({ id: `imported-${_entries.length + i}` }))];
    return route.fulfill({ status: 201, json: { imported: rows.length, entries: _entries } });
  });

  await page.route("**/logbook/api/admin/places", async route => {
    if (route.request().method() !== "POST") return route.continue();
    _places = [..._places, route.request().postDataJSON()];
    return route.fulfill({ status: 201, json: { places: _places } });
  });

  await page.route("**/logbook/api/admin/locations", async route => {
    if (route.request().method() !== "POST") return route.continue();
    _locations = [..._locations, route.request().postDataJSON()];
    return route.fulfill({ status: 201, json: { locations: _locations } });
  });
}
