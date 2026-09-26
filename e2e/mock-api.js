// Fakes the /-/api/* responses the real bundles fetch, statefully for one test (docs/app-architecture.md, Testing).
const EMPTY_PYRAMID = { top4: [], lower: [], hasSends: false, promotedGrade: null };

export async function mockApi(page, {
  entries = [], places = [], locations = [], settings = { athleteMode: false, activeDiscipline: "boulder", logbookPublic: true, betaOptIn: false },
  loggedIn = true, username = "fixtureuser", email = "fixtureuser@example.com",
  pyramidData = { boulder: EMPTY_PYRAMID, sport: EMPTY_PYRAMID },
  injuryData = { log: [], cluster: null },
  strengthsData = { headline: null, anchors: [] },
  strengthsRankedData = { ranked: [] },
  volumeData = {
    boulder: { buckets: ["-3w", "-2w", "-1w"], sendCounts: [0, 0, 0], maxGradeByBucket: [null, null, null] },
    sport: { buckets: ["-3w", "-2w", "-1w"], sendCounts: [0, 0, 0], maxGradeByBucket: [null, null, null] },
  },
  gapData = {
    boulder: { buckets: ["-3w", "-2w", "-1w"], flashMaxByBucket: [null, null, null], sendMaxByBucket: [null, null, null], avgAttemptsByBucket: [null, null, null], headline: "No sends logged in this window yet." },
    sport: { buckets: ["-3w", "-2w", "-1w"], flashMaxByBucket: [null, null, null], sendMaxByBucket: [null, null, null], avgAttemptsByBucket: [null, null, null], headline: "No sends logged in this window yet." },
  },
  effortData = {
    boulder: { buckets: ["-3w", "-2w", "-1w"], maxGradeByBucket: [null, null, null], avgExertionByBucket: [null, null, null], headline: null },
    sport: { buckets: ["-3w", "-2w", "-1w"], maxGradeByBucket: [null, null, null], avgExertionByBucket: [null, null, null], headline: null },
  },
  synced = true,
} = {}) {
  let _entries = [...entries];
  let _places = [...places];
  let _locations = [...locations];
  let _settings = { ...settings };

  // A counter stands in for sync_cursor, so the >= delta contract is deterministic.
  let _cursor = 0;
  const cursorOf = new Map();
  function stamp(row) { cursorOf.set(row.id, ++_cursor); return row; }
  [..._entries, ..._places, ..._locations].forEach(stamp);

  // The harness pages share an origin with real pages, so start each test with clean storage.
  await page.addInitScript(() => localStorage.clear());
  if (synced) {
    // Seeds the caches a warm device has, so /log boots without a cold sync.
    const cursors = {
      entries: Math.max(0, ..._entries.map(e => cursorOf.get(e.id) ?? 0)),
      places: Math.max(0, ..._places.map(p => cursorOf.get(p.id) ?? 0)),
      locations: Math.max(0, ..._locations.map(l => cursorOf.get(l.id) ?? 0)),
    };
    await page.addInitScript(({ seedEntries, seedPlaces, seedLocations, cursors }) => {
      localStorage.setItem("logbook_sync_status", JSON.stringify({ version: 1, syncedAt: Date.now() }));
      localStorage.setItem("logbook_entries_cache", JSON.stringify(seedEntries));
      localStorage.setItem("logbook_places_cache", JSON.stringify(seedPlaces));
      localStorage.setItem("logbook_locations_cache", JSON.stringify(seedLocations));
      localStorage.setItem("logbook_sync_cursors", JSON.stringify(cursors));
    }, { seedEntries: _entries, seedPlaces: _places, seedLocations: _locations, cursors });
  }

  await page.route("**/-/api/auth/get-session", route =>
    route.fulfill({ json: loggedIn ? { session: { id: "s1" }, user: { id: "u1", username, email } } : null }));

  // Mocked: a real sign-out would end the suite's shared session.
  await page.route("**/-/api/auth/sign-out", route => route.fulfill({ json: {} }));

  await page.route("**/-/api/auth/update-user", route => route.fulfill({ json: { status: true } }));
  await page.route("**/-/api/auth/change-password", route => route.fulfill({ json: { status: true, user: { id: "u1", email } } }));
  await page.route("**/-/api/auth/change-email", route => route.fulfill({ json: { status: true } }));

  await page.route("**/-/api/entries*", route => {
    const url = new URL(route.request().url());
    const locationId = url.searchParams.get("locationId");
    const limitParam = url.searchParams.get("limit");
    const sinceParam = url.searchParams.get("since");
    const offset = Number(url.searchParams.get("offset")) || 0;

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
    if (limitParam !== null) {
      const limit = Number(limitParam);
      const cursor = _entries.reduce((max, e) => Math.max(max, cursorOf.get(e.id) ?? 0), 0);
      const afterId = url.searchParams.get("afterId");
      const start = afterId ? _entries.findIndex(e => e.id === afterId) + 1 : 0;
      const page = _entries.slice(start, start + limit);
      const next = page.length === limit ? { createdAt: "", id: page.at(-1).id } : null;
      return route.fulfill({ json: { entries: page, total: _entries.length, cursor, next } });
    }
    return route.fulfill({ json: { entries: _entries } });
  });
  await page.route("**/-/api/places*", route => {
    const since = new URL(route.request().url()).searchParams.get("since");
    if (since === null) return route.fulfill({ json: { places: _places } });
    const changed = _places.filter(p => (cursorOf.get(p.id) ?? 0) >= Number(since));
    const cursor = changed.reduce((max, p) => Math.max(max, cursorOf.get(p.id)), Number(since));
    return route.fulfill({ json: { places: changed, cursor } });
  });
  await page.route("**/-/api/locations*", route => {
    const since = new URL(route.request().url()).searchParams.get("since");
    if (since === null) return route.fulfill({ json: { locations: _locations } });
    const changed = _locations.filter(l => (cursorOf.get(l.id) ?? 0) >= Number(since));
    const cursor = changed.reduce((max, l) => Math.max(max, cursorOf.get(l.id)), Number(since));
    return route.fulfill({ json: { locations: changed, cursor } });
  });
  await page.route("**/-/api/settings", route => route.fulfill({ json: _settings }));
  await page.route("**/-/api/performance/pyramid**", route => route.fulfill({ json: pyramidData }));
  await page.route("**/-/api/performance/injury", route => route.fulfill({ json: injuryData }));
  await page.route("**/-/api/performance/strengths**", route => {
    const url = new URL(route.request().url());
    const isDrilldown = url.searchParams.has("dimension") && url.searchParams.has("value");
    return route.fulfill({ json: isDrilldown ? strengthsRankedData : strengthsData });
  });
  await page.route("**/-/api/performance/volume**", route => route.fulfill({ json: volumeData }));
  await page.route("**/-/api/performance/gap**", route => route.fulfill({ json: gapData }));
  await page.route("**/-/api/performance/rpe**", route => route.fulfill({ json: effortData }));

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
  await page.route("**/-/api/map/counts", route => route.fulfill({ json: computeMapCounts() }));

  function computeLocationCounts() {
    const counts = {};
    for (const entry of _entries) {
      const locationId = _places.find(p => p.id === entry.placeId)?.locationId;
      if (locationId) counts[locationId] = (counts[locationId] ?? 0) + 1;
    }
    return counts;
  }

  await page.route("**/-/api/public/*/entries*", route => {
    const locationId = new URL(route.request().url()).searchParams.get("locationId");
    if (!locationId) return route.fulfill({ json: { entries: _entries } });
    const limit = Number(new URL(route.request().url()).searchParams.get("limit")) || 20;
    const scoped = _entries.filter(e => _places.find(p => p.id === e.placeId)?.locationId === locationId);
    return route.fulfill({ json: { entries: scoped.slice(0, limit) } });
  });
  await page.route("**/-/api/public/*/entries/counts", route =>
    route.fulfill({ json: { locations: _locations, places: _places, counts: computeLocationCounts() } }));
  await page.route("**/-/api/public/*/places", route => route.fulfill({ json: { places: _places } }));
  await page.route("**/-/api/public/*/locations", route => route.fulfill({ json: { locations: _locations } }));
  await page.route("**/-/api/public/*/map/counts", route => route.fulfill({ json: computeMapCounts() }));

  // route.fallback(), not continue(), which would go to the real network.
  await page.route("**/-/api/settings", async route => {
    if (route.request().method() !== "PATCH") return route.fallback();
    _settings = { ..._settings, ...route.request().postDataJSON() };
    return route.fulfill({ json: _settings });
  });

  // A trailing * or the query string (?id=) never matches; * doesn't cross /, so /import is safe.
  await page.route("**/-/api/entries*", async route => {
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
    return route.fallback();
  });

  await page.route("**/-/api/entries/import", async route => {
    if (route.request().method() !== "POST") return route.continue();
    const contentType = route.request().headers()["content-type"] ?? "";
    const rowCount = contentType.includes("json")
      ? (JSON.parse(route.request().postData() || "[]").length)
      : (route.request().postData() || "").trim().split("\n").slice(1).filter(Boolean).length;
    _entries = [..._entries, ...Array.from({ length: rowCount }, (_, i) => ({ id: `imported-${_entries.length + i}` }))];
    return route.fulfill({ status: 201, json: { imported: rowCount, entries: _entries } });
  });

  await page.route("**/-/api/places*", async route => {
    if (route.request().method() !== "POST") return route.fallback();
    const body = route.request().postDataJSON();
    const duplicate = _places.find(p => p.locationId === body.locationId && (p.area ?? "").toLowerCase() === (body.area ?? "").toLowerCase());
    if (duplicate) return route.fulfill({ json: { places: _places, dedupedTo: duplicate.id } });
    _places = [..._places, stamp(body)];
    return route.fulfill({ status: 201, json: { places: _places } });
  });

  await page.route("**/-/api/locations*", async route => {
    if (route.request().method() !== "POST") return route.fallback();
    const body = route.request().postDataJSON();
    const duplicate = _locations.find(l => l.name.toLowerCase() === body.name.toLowerCase());
    if (duplicate) return route.fulfill({ json: { locations: _locations, dedupedTo: duplicate.id } });
    _locations = [..._locations, stamp(body)];
    return route.fulfill({ status: 201, json: { locations: _locations } });
  });
}
