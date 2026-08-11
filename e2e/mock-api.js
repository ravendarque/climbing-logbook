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
export async function mockApi(page, { entries = [], places = [], locations = [], settings = { athleteMode: false, activeDiscipline: "boulder", logbookPublic: true }, loggedIn = true, username = "fixtureuser" } = {}) {
  let _entries = [...entries];
  let _places = [...places];
  let _locations = [...locations];
  let _settings = { ...settings };

  // Fresh, isolated localStorage per test -- these harness pages share an
  // origin with every other page in the app (including real ones), so
  // without this a prior test's offline-queue/cache writes could leak in.
  await page.addInitScript(() => localStorage.clear());

  await page.route("**/logbook/api/auth/get-session", route =>
    route.fulfill({ json: loggedIn ? { session: { id: "s1" }, user: { id: "u1", username } } : null }));

  await page.route("**/logbook/api/logbook", route => route.fulfill({ json: { entries: _entries } }));
  await page.route("**/logbook/api/places", route => route.fulfill({ json: { places: _places } }));
  await page.route("**/logbook/api/locations", route => route.fulfill({ json: { locations: _locations } }));
  await page.route("**/logbook/api/settings", route => route.fulfill({ json: _settings }));

  // Path-scoped by :username (src/api/public-data.js's own route shape)
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
