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
  entries = [], places = [], locations = [], settings = { athleteMode: false, activeDiscipline: "boulder", logbookPublic: true, betaOptIn: null },
  loggedIn = true, username = "fixtureuser", email = "fixtureuser@example.com",
  // #111 -- server/api/performance.js's own computed shape, not raw
  // entries -- mock-api.js doesn't replicate the real aggregation logic
  // (that's shared/pyramid-stats.js's own job, covered directly by
  // test/shared/pyramid-stats.test.js); a test that needs a real pyramid
  // supplies the already-split result it expects to see rendered.
  pyramidData = { boulder: EMPTY_PYRAMID, lead: EMPTY_PYRAMID },
  // #39 -- server/api/performance.js's own handleGetInjuryLog() shape
  // ({ log, cluster }), same "already-computed, not raw entries" contract
  // as pyramidData above -- a test that needs a real ranked cluster/log
  // supplies the shape it expects to see rendered, same reasoning.
  injuryData = { log: [], cluster: null },
  // #13 -- server/api/performance.js's own handleGetStrengthsWeaknesses()
  // shape, but unlike pyramidData/injuryData above this endpoint returns
  // TWO different shapes off the same route depending on whether the
  // request carries ?dimension=&value= (see the page.route() below) --
  // strengthsData is the no-drilldown { headline, anchors } shape, and
  // strengthsRankedData is the drill-down { ranked } shape a test only
  // needs to supply when it actually exercises the anchor picker.
  strengthsData = { headline: null, anchors: [] },
  strengthsRankedData = { ranked: [] },
  // #15 -- server/api/performance.js's own handleGetVolume() shape, same
  // "already-computed, not raw entries" contract as pyramidData/
  // injuryData above. Unlike strengthsData's own route, this endpoint
  // always returns the same one shape regardless of query params, so a
  // test only needs to override this when it wants non-zero sends.
  volumeData = {
    boulder: { buckets: ["Jan 2026", "Feb 2026", "Mar 2026"], sendCounts: [0, 0, 0], maxGradeByBucket: [null, null, null] },
    lead: { buckets: ["Jan 2026", "Feb 2026", "Mar 2026"], sendCounts: [0, 0, 0], maxGradeByBucket: [null, null, null] },
  },
  // #14 -- server/api/performance.js's own handleGetGap() shape, same
  // "already-computed, not raw entries" contract as pyramidData/
  // injuryData/volumeData above. Same one-shape-regardless-of-query-string
  // behavior as volumeData's own route.
  gapData = {
    boulder: { buckets: ["Jan 2026", "Feb 2026", "Mar 2026"], flashMaxByBucket: [null, null, null], sendMaxByBucket: [null, null, null], avgAttemptsByBucket: [0, 0, 0], headline: "No sends logged in this window yet." },
    lead: { buckets: ["Jan 2026", "Feb 2026", "Mar 2026"], flashMaxByBucket: [null, null, null], sendMaxByBucket: [null, null, null], avgAttemptsByBucket: [0, 0, 0], headline: "No sends logged in this window yet." },
  },
  // #38 -- server/api/performance.js's own handleGetEffort() shape, same
  // "already-computed, not raw entries" contract as the routes above.
  // Same one-shape-regardless-of-query-string behavior as gapData/
  // volumeData's own routes. Defaults below the confidence gate (null
  // headline) -- a test that needs a confident headline supplies it.
  effortData = {
    boulder: { buckets: ["Jan 2026", "Feb 2026", "Mar 2026"], maxGradeByBucket: [null, null, null], avgExertionByBucket: [0, 0, 0], headline: null },
    lead: { buckets: ["Jan 2026", "Feb 2026", "Mar 2026"], maxGradeByBucket: [null, null, null], avgExertionByBucket: [0, 0, 0], headline: null },
  },
  // #498 -- true by default: seeds client/sync-status.js's own marker so
  // every EXISTING test (written before /sync existed) still lands
  // directly on /log rather than being redirected through a sync flow
  // it isn't testing. A test that specifically exercises /sync (cold
  // start, the migration-safety case) passes `synced: false` to see the
  // real un-synced behavior instead.
  synced = true,
} = {}) {
  let _entries = [...entries];
  let _places = [...places];
  let _locations = [...locations];
  let _settings = { ...settings };

  // #500 -- a monotonically increasing counter standing in for the real
  // server's epoch-ms sync_cursor (server/lib/d1-resource.js) -- doesn't
  // need to be wall-clock-based here, just strictly increasing per
  // write, so the ?since= routes below can reproduce the real `>=`
  // delta contract deterministically instead of racing Date.now() at
  // test speed. Kept in a side Map, not stamped directly onto the
  // entry/place/location objects -- every OTHER route here still hands
  // those objects straight back out over the wire, and a test asserting
  // an exact seeded shape shouldn't have to know this file's own
  // bookkeeping exists.
  let _cursor = 0;
  const cursorOf = new Map();
  function stamp(row) { cursorOf.set(row.id, ++_cursor); return row; }
  [..._entries, ..._places, ..._locations].forEach(stamp);

  // Fresh, isolated localStorage per test -- these harness pages share an
  // origin with every other page in the app (including real ones), so
  // without this a prior test's offline-queue/cache writes could leak in.
  await page.addInitScript(() => localStorage.clear());
  if (synced) {
    // #501 -- also seeds the entries cache itself, not just the sync
    // marker: /log's own warm boot (client/log-main.js) reads entries
    // straight from localStorage now, no network fetch at all (ADR-0019
    // -- a real sync, client/sync-main.js, is what's supposed to
    // populate this in the real app). Without this, every existing
    // /log-page test would see an empty table despite `entries` being
    // seeded into mockApi() itself, since nothing would ever write it
    // to the one place /log's boot() actually reads from. Literal key/
    // shape mirrored from client/sync-status.js/store.js rather than
    // imported -- addInitScript's function runs in the page, not this
    // Node context, same reasoning every other route here fakes the
    // server's contract instead of importing the real handler.
    //
    // #500 -- also seeds logbook_sync_cursors at each table's current
    // max, matching client/sync-cursors.js's own shape: without this, a
    // test that dispatches a real `online` event (e2e/log-page.spec.js's
    // own offline-queue tests) would see offline-sync.js's new
    // pullDeltas() step treat this "already synced" device as never
    // having a recorded cursor, re-fetching the whole seeded dataset via
    // since=0 on every reconnect instead of the genuinely-caught-up
    // no-op a real warm device would see.
    const cursors = {
      entries: Math.max(0, ..._entries.map(e => cursorOf.get(e.id) ?? 0)),
      places: Math.max(0, ..._places.map(p => cursorOf.get(p.id) ?? 0)),
      locations: Math.max(0, ..._locations.map(l => cursorOf.get(l.id) ?? 0)),
    };
    await page.addInitScript(({ seedEntries, cursors }) => {
      localStorage.setItem("logbook_sync_status", JSON.stringify({ version: 1, syncedAt: Date.now() }));
      localStorage.setItem("logbook_entries_cache", JSON.stringify(seedEntries));
      localStorage.setItem("logbook_sync_cursors", JSON.stringify(cursors));
    }, { seedEntries: _entries, cursors });
  }

  await page.route("**/logbook/api/auth/get-session", route =>
    route.fulfill({ json: loggedIn ? { session: { id: "s1" }, user: { id: "u1", username, email } } : null }));

  // #561/#562 -- unlike every other auth route here, this one was
  // previously left unmocked, so it silently fell through to the real
  // local dev server carrying whatever real session cookie the browser
  // context actually has -- for the default (non-isolated) storageState,
  // that's this whole suite's own shared, globalSetup-bootstrapped dev
  // user session (playwright.config.js). A test that clicks the real
  // log-out control was therefore genuinely invalidating that shared
  // session server-side, silently breaking every later test in the run
  // that assumes it's still logged in (found the hard way: e2e/log-page.
  // spec.js's own #561 test passed in isolation but broke e2e/zero-
  // friction-redirect.spec.js's "logged in" tests once both ran in the
  // same suite). Fulfilled here, not per-test, so no future consumer of
  // this fixture can reintroduce the same class of bug by accident.
  await page.route("**/logbook/api/auth/sign-out", route => route.fulfill({ json: {} }));

  // #302 -- canned success responses matching Better Auth's own real
  // response shapes (confirmed against the installed source), not
  // exercising Better Auth itself -- e2e/account-edit-page.spec.js's job
  // is proving client/account-edit-main.js's own wiring (view/form
  // toggle, request, display update), same "fake but stateful enough for
  // the test's own duration" scope as every other route here.
  await page.route("**/logbook/api/auth/update-user", route => route.fulfill({ json: { status: true } }));
  await page.route("**/logbook/api/auth/change-password", route => route.fulfill({ json: { status: true, user: { id: "u1", email } } }));
  await page.route("**/logbook/api/auth/change-email", route => route.fulfill({ json: { status: true } }));

  // #111 -- honors locationId/limit/offset when present (the "Show
  // more"/"Show all" follow-up shape), same contract as server/api/
  // logbook.js's own handleGet, so a test exercising that UI genuinely
  // proves the client's own request construction rather than always
  // getting back everything regardless of what it asked for. Trailing
  // `*` -- see the admin/logbook route below's own comment on why a bare
  // pattern silently never matches a query-string-bearing URL at all.
  await page.route("**/logbook/api/logbook*", route => {
    const url = new URL(route.request().url());
    const locationId = url.searchParams.get("locationId");
    const limitParam = url.searchParams.get("limit");
    const sinceParam = url.searchParams.get("since");
    const offset = Number(url.searchParams.get("offset")) || 0;

    // #500 -- ?since= switches to the delta shape (mirrors server/api/
    // logbook.js's own handleGet) -- checked first, mutually exclusive
    // with locationId/limit below, same precedence as the real handler.
    // Every row here comes back `deleted: false` -- this mock's own
    // DELETE route (below) still does a hard removal rather than
    // replicating #499's tombstone/soft-delete, out of scope for what
    // #500's own e2e coverage needs (a warm-with-drift *catch-up*
    // scenario, not a delete-propagation one -- that's already covered
    // directly by test/logbook.test.js's own Vitest contract tests).
    if (sinceParam !== null) {
      const since = Number(sinceParam);
      const changed = _entries.filter(e => (cursorOf.get(e.id) ?? 0) >= since);
      const cursor = changed.reduce((max, e) => Math.max(max, cursorOf.get(e.id)), since);
      return route.fulfill({ json: { entries: changed.map(e => ({ ...e, deleted: false })), cursor } });
    }

    if (locationId) {
      const limit = Number(limitParam) || 20;
      const scoped = _entries.filter(e => _places.find(p => p.id === e.placeId)?.locationId === locationId);
      return route.fulfill({ json: { entries: scoped.slice(offset, offset + limit) } });
    }
    // #498 -- flat chunked mode (no locationId, `limit` present): mirrors
    // server/api/logbook.js's own `total` field (COUNT(*) OVER(), the
    // true count regardless of this slice's own offset/limit) --
    // client/sync-main.js's progress bar depends on it. `cursor` (#500)
    // -- MAX(sync_cursor) OVER(), same independence from offset/limit --
    // is what the cold path records as this table's starting point for
    // a future warm delta fetch.
    if (limitParam !== null) {
      const limit = Number(limitParam);
      const cursor = _entries.reduce((max, e) => Math.max(max, cursorOf.get(e.id) ?? 0), 0);
      return route.fulfill({ json: { entries: _entries.slice(offset, offset + limit), total: _entries.length, cursor } });
    }
    return route.fulfill({ json: { entries: _entries } });
  });
  // #500 -- ?since= (mirrors the shared factory's own handleGet in
  // server/lib/d1-resource.js, which places.js/locations.js both use
  // unmodified) -- trailing `*`, not a bare pattern, since a query
  // string appended (?since=...) otherwise never matches (see the
  // admin/logbook route further down for the fuller version of this
  // same gotcha).
  await page.route("**/logbook/api/places*", route => {
    const since = new URL(route.request().url()).searchParams.get("since");
    if (since === null) return route.fulfill({ json: { places: _places } });
    const changed = _places.filter(p => (cursorOf.get(p.id) ?? 0) >= Number(since));
    const cursor = changed.reduce((max, p) => Math.max(max, cursorOf.get(p.id)), Number(since));
    return route.fulfill({ json: { places: changed, cursor } });
  });
  await page.route("**/logbook/api/locations*", route => {
    const since = new URL(route.request().url()).searchParams.get("since");
    if (since === null) return route.fulfill({ json: { locations: _locations } });
    const changed = _locations.filter(l => (cursorOf.get(l.id) ?? 0) >= Number(since));
    const cursor = changed.reduce((max, l) => Math.max(max, cursorOf.get(l.id)), Number(since));
    return route.fulfill({ json: { locations: changed, cursor } });
  });
  await page.route("**/logbook/api/settings", route => route.fulfill({ json: _settings }));
  await page.route("**/logbook/api/performance/pyramid", route => route.fulfill({ json: pyramidData }));
  await page.route("**/logbook/api/performance/injury", route => route.fulfill({ json: injuryData }));
  // #13 -- single route, branches on the request's own query params
  // (unlike pyramidData/injuryData above, which each always return one
  // fixed shape) -- trailing `**`, not `*`, since Playwright's glob route
  // matching needs to cross the `?` itself here, not just match within the
  // query string the way the trailing `*` routes elsewhere in this file do.
  await page.route("**/logbook/api/performance/strengths**", route => {
    const url = new URL(route.request().url());
    const isDrilldown = url.searchParams.has("dimension") && url.searchParams.has("value");
    return route.fulfill({ json: isDrilldown ? strengthsRankedData : strengthsData });
  });
  // #15 -- real requests always carry ?start=&end= (server/api/
  // performance.js's own handleGetVolume 400s without them), but unlike
  // the strengths route above this one returns the same one shape
  // regardless of the query string -- trailing `**`, not `*`, for the
  // same "must cross the `?` itself" reason as that route's own comment,
  // even though this route's own handler logic doesn't branch on it.
  await page.route("**/logbook/api/performance/volume**", route => route.fulfill({ json: volumeData }));
  // #14 -- real requests always carry ?start=&end= (handleGetGap 400s
  // without them, same as handleGetVolume), and this route also returns
  // the same one shape regardless of the query string.
  await page.route("**/logbook/api/performance/gap**", route => route.fulfill({ json: gapData }));
  // #38 -- real requests always carry ?start=&end= (handleGetEffort 400s
  // without them, same as handleGetVolume/handleGetGap).
  await page.route("**/logbook/api/performance/rpe**", route => route.fulfill({ json: effortData }));

  // #497 -- mirrors server/api/map.js's own aggregation (country x
  // discipline -> { total, flash, send, project }), computed fresh from
  // the current _entries/_places/_locations on every request, same as
  // every other route here that reflects live seeded state rather than a
  // static snapshot.
  function computeMapCounts() {
    const counts = {};
    for (const entry of _entries) {
      const place = _places.find(p => p.id === entry.placeId);
      const location = _locations.find(l => l.id === place?.locationId);
      const country = location?.country ?? "";
      counts[country] ??= {};
      counts[country][entry.type] ??= { total: 0, flash: 0, send: 0, project: 0 };
      const bucket = counts[country][entry.type];
      bucket.total++;
      if (entry.status === "send" && entry.firstAttempt) bucket.flash++;
      else if (entry.status === "send") bucket.send++;
      else if (entry.status === "project") bucket.project++;
    }
    return counts;
  }
  await page.route("**/logbook/api/map/counts", route => route.fulfill({ json: computeMapCounts() }));

  // #494 -- per-location live-entry counts, mirroring server/api/
  // profile-counts.js's own aggregation, computed fresh from the current
  // _entries/_places on every request like computeMapCounts() above.
  function computeLocationCounts() {
    const counts = {};
    for (const entry of _entries) {
      const locationId = _places.find(p => p.id === entry.placeId)?.locationId;
      if (locationId) counts[locationId] = (counts[locationId] ?? 0) + 1;
    }
    return counts;
  }

  // Path-scoped by :username (server/api/public-data.js's own route shape)
  // -- glob-wildcarded since the harness's own synthetic USERNAME (parsed
  // client-side from location.pathname) doesn't matter for what's being
  // tested here. Trailing `*` on the plain logbook route (#494) -- the
  // public profile's own lazy mode now requests it with `?locationId=&
  // limit=`, and a bare pattern never matches a query-string-bearing URL
  // (same gotcha this file's own admin/logbook route comment documents).
  await page.route("**/logbook/api/public/*/logbook*", route => {
    const locationId = new URL(route.request().url()).searchParams.get("locationId");
    if (!locationId) return route.fulfill({ json: { entries: _entries } });
    const limit = Number(new URL(route.request().url()).searchParams.get("limit")) || 20;
    const scoped = _entries.filter(e => _places.find(p => p.id === e.placeId)?.locationId === locationId);
    return route.fulfill({ json: { entries: scoped.slice(0, limit) } });
  });
  await page.route("**/logbook/api/public/*/logbook/counts", route =>
    route.fulfill({ json: { locations: _locations, places: _places, counts: computeLocationCounts() } }));
  await page.route("**/logbook/api/public/*/places", route => route.fulfill({ json: { places: _places } }));
  await page.route("**/logbook/api/public/*/locations", route => route.fulfill({ json: { locations: _locations } }));
  await page.route("**/logbook/api/public/*/map/counts", route => route.fulfill({ json: computeMapCounts() }));

  await page.route("**/logbook/api/admin/settings", async route => {
    if (route.request().method() !== "PATCH") return route.continue();
    _settings = { ..._settings, ...route.request().postDataJSON() };
    return route.fulfill({ json: _settings });
  });

  // Trailing `*` -- Playwright's URL glob matching requires an exact
  // literal match all the way to the end of the URL string (query string
  // included) when a pattern has no trailing wildcard, so a bare
  // "**/logbook/api/admin/logbook" silently never matches
  // "...admin/logbook?id=X" (confirmed empirically) and the DELETE below
  // would otherwise fall through unmocked to the real network. `*`
  // doesn't cross `/`, so this still can't accidentally also swallow the
  // sibling "/admin/logbook/import" route below.
  await page.route("**/logbook/api/admin/logbook*", async route => {
    const method = route.request().method();
    if (method === "POST") {
      _entries = [..._entries, stamp(route.request().postDataJSON())];
      return route.fulfill({ status: 201, json: { entries: _entries } });
    }
    if (method === "PUT") {
      const body = stamp(route.request().postDataJSON());
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

  // #490 -- mirrors server/lib/d1-resource.js's own dedup-on-write: a
  // case-insensitive area match under the same locationId reuses the
  // existing row (200 + dedupedTo) instead of inserting a duplicate --
  // needed so e2e/log-page.spec.js's own offline-queue-remap test can
  // exercise the real client-side remap logic (client/offline-sync.js)
  // against a mocked dedup response, not just the server-side rule
  // itself (already covered directly by test/handlers.test.js).
  await page.route("**/logbook/api/admin/places", async route => {
    if (route.request().method() !== "POST") return route.continue();
    const body = route.request().postDataJSON();
    const duplicate = _places.find(p => p.locationId === body.locationId && (p.area ?? "").toLowerCase() === (body.area ?? "").toLowerCase());
    if (duplicate) return route.fulfill({ json: { places: _places, dedupedTo: duplicate.id } });
    _places = [..._places, stamp(body)];
    return route.fulfill({ status: 201, json: { places: _places } });
  });

  await page.route("**/logbook/api/admin/locations", async route => {
    if (route.request().method() !== "POST") return route.continue();
    const body = route.request().postDataJSON();
    const duplicate = _locations.find(l => l.name.toLowerCase() === body.name.toLowerCase());
    if (duplicate) return route.fulfill({ json: { locations: _locations, dedupedTo: duplicate.id } });
    _locations = [..._locations, stamp(body)];
    return route.fulfill({ status: 201, json: { locations: _locations } });
  });
}
