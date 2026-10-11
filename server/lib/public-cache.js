// Every write to a user's entries, places or locations bumps its sync_cursor (deletes and admin hides included), so
// the highest of them names the current state of that user's public data. A hard delete must not lower it to a
// value an older, different state was cached under (#1051).
export async function dataVersion(env, userId) {
  const row = await env.LOGBOOK_DB.prepare(
    `SELECT (SELECT max(sync_cursor) FROM entries WHERE user_id = ?1) AS e,
            (SELECT max(sync_cursor) FROM places WHERE user_id = ?1) AS p,
            (SELECT max(sync_cursor) FROM locations WHERE user_id = ?1) AS l`,
  )
    .bind(userId)
    .first();
  return `${row?.e ?? 0}.${row?.p ?? 0}.${row?.l ?? 0}`;
}

// Only what the public handlers read goes in the key, so junk parameters can't make every request a miss.
const READ_PARAMS = new Set([
  "limit",
  "offset",
  "locationId",
  "afterCreatedAt",
  "afterId",
  "boulderScale",
  "sportScale",
  "dimension",
  "value",
  "start",
  "end",
]);

function marked(response, state) {
  const copy = new Response(response.body, response);
  copy.headers.set("Cache-Control", "no-store");
  copy.headers.set("X-Public-Cache", state);
  return copy;
}

// The expensive part of a public read, cached at the edge under the data's version: a change makes a new key, so
// nothing stale is ever served and nothing needs purging. Whether the logbook is public is checked before this, on
// every request, so making it private takes effect at once (#1059).
export async function cachedPublic(request, env, ctx, userId, resource, produce) {
  const asked = new URL(request.url).searchParams;
  const params = new URLSearchParams([...asked].filter(([name]) => READ_PARAMS.has(name)));
  params.sort();
  const version = await dataVersion(env, userId);
  // The day too: the reports count climbs from the last 12 months of today.
  const day = new Date().toISOString().slice(0, 10);
  const key = new Request(`https://public-cache.invalid/${userId}/${resource}/${version}/${day}?${params}`);
  const cache = caches.default;

  const hit = await cache.match(key);
  if (hit) return marked(hit, "HIT");

  const response = await produce();
  if (response.status !== 200) return response;
  const stored = new Response(response.clone().body, response);
  stored.headers.set("Cache-Control", "public, max-age=86400");
  const put = cache.put(key, stored);
  if (ctx?.waitUntil) ctx.waitUntil(put);
  else await put;
  return marked(response, "MISS");
}
