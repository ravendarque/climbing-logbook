const CACHE_NAME = "logbook-shell-v1";

const APP_SHELL = [
  "/logbook/",
  "/logbook/index.html",
  "/logbook/app.js",
  "/logbook/escape-html.js",
  "/logbook/status-icons.js",
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
// lets a stale "logged in" response get served back after the real Access
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
