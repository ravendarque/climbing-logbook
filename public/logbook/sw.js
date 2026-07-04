const CACHE_NAME = "logbook-shell-v1";

const APP_SHELL = [
  "/logbook/",
  "/logbook/index.html",
  "/logbook/escape-html.js",
  "/logbook/status-icons.js",
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

// Network-first, cache-fallback for GETs (app shell and /logbook/api/logbook).
// Non-GET requests (writes) pass through untouched so the page's own
// offline-queue logic can detect the failure.
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request)
      .then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
