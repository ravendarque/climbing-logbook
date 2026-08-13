// v2 (#375) -- /logbook (the page) is retired; the entries below that
// named its own shell (/logbook/, index.html, app.js) are gone, and
// nothing replaced them with a single fixed page to precache -- every
// real page now lives at /:username/{log,map,performance,account,
// account/edit}, a different URL per user, not something this shared,
// path-fixed script can hardcode. Version bump forces any already-
// installed client to drop its stale cache (which still held those now-
// 404ing entries) rather than serving them forever. The fetch handler
// below still network-first/cache-falls-back every real page and its own
// JS bundle the first time it's visited online, same as always -- this
// list is only a *pre*-cache optimization for the very first offline
// visit before any online one, not what makes offline work at all.
const CACHE_NAME = "logbook-shell-v2";

const APP_SHELL = [
  "/logbook/escape-html.js",
  "/logbook/floating-ui-core.js",
  "/logbook/floating-ui-dom.js",
  "/logbook/manifest.json",
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Paths whose GET responses must never be cached, even though res.ok is
// true. /logbook/api/logbook also sets Cache-Control: no-store, but that
// header is about preventing HTTP-level caching upstream, not about this
// SW's own Cache Storage fallback -- that endpoint is deliberately cached
// here for offline reads. Session/login checks are different: caching them
// lets a stale "logged in" response get served back after the real
// session has ended, so they're excluded by path instead.
const NEVER_CACHE_PREFIXES = ["/logbook/api/admin/", "/logbook/api/settings"];

// Network-first, cache-fallback for GETs (app shell and /logbook/api/logbook).
// Non-GET requests (writes) pass through untouched so the page's own
// offline-queue logic can detect the failure.
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  const { pathname } = new URL(event.request.url);
  const skipCache = NEVER_CACHE_PREFIXES.some(p => pathname.startsWith(p));

  event.respondWith(
    fetch(event.request)
      .then(res => {
        if (res.ok && !skipCache) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
