// #947, ADR-0028 -- the service worker. Bundled by the production build
// (scripts/service-worker-build.mjs) into /sw.js with BUILD_ID and the
// pre-cache list injected, registered with scope "/" by owner pages only
// (client/register-sw.js).
//
// It serves the owner app's *shell* -- page HTML and static assets -- so
// the chrome needs no network, and it never touches data: every API call
// passes through untouched, and client/store.js owns what's cached of it.
// Routing comes from classify.js; what may be cached from responses.js.
import { classifyRequest } from "./classify.js";
import { cacheNameFor, cachesToDelete } from "./caches.js";
import { isCacheableAsset, isCacheableShell, shellCacheKey } from "./responses.js";

/* global __BUILD_ID__, __PRECACHE__ */
const BUILD_ID = __BUILD_ID__;
const CACHE_NAME = cacheNameFor(BUILD_ID);
// Filled by #948 (pre-cache every owner page at install).
const PRECACHE = __PRECACHE__;

self.LOGBOOK_BUILD = Object.freeze({ id: BUILD_ID, cacheName: CACHE_NAME, precache: PRECACHE });

self.addEventListener("install", () => {
  // A new build takes over as soon as it's installed; pages pick up its
  // shells on their next launch (no forced reload, ADR-0028 decision 6).
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    // Keep this build's cache and the previous build's (an open tab from
    // the last build keeps finding its assets); drop the rest.
    const stale = cachesToDelete(await caches.keys(), CACHE_NAME);
    await Promise.all(stale.map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

async function put(request, response) {
  const cache = await caches.open(CACHE_NAME);
  await cache.put(request, response);
}

// Owner page: cache-first from this build's cache, keyed by page type. No
// per-navigation revalidation -- shells only change when the build does,
// and re-downloading them on every launch would compete with the page's
// own delta fetch on a bad connection.
async function ownerShell(event, page) {
  const key = shellCacheKey(page, self.location.origin);
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(key);
  if (cached) return cached;
  const response = await fetch(event.request);
  if (isCacheableShell(response, page)) event.waitUntil(cache.put(key, response.clone()));
  return response;
}

// Content-addressed: the URL changes whenever the content does, so any
// cached copy (this build's or the previous one's) is right forever.
async function immutable(event) {
  const cached = await caches.match(event.request);
  if (cached) return cached;
  const response = await fetch(event.request);
  if (isCacheableAsset(response)) event.waitUntil(put(event.request, response.clone()));
  return response;
}

// Fonts have an unversioned URL: serve the cached copy straight away and
// refresh it in the background.
async function staleWhileRevalidate(event) {
  const cached = await caches.match(event.request);
  const refresh = fetch(event.request).then(response => {
    if (isCacheableAsset(response)) return put(event.request, response.clone()).then(() => response);
    return response;
  });
  if (cached) {
    event.waitUntil(refresh.catch(() => {}));
    return cached;
  }
  return refresh;
}

// Other /logbook/ static files (icons, manifest, world-map data): the
// network when there is one, the last good copy when there isn't.
async function networkFirst(event) {
  try {
    const response = await fetch(event.request);
    if (isCacheableAsset(response)) event.waitUntil(put(event.request, response.clone()));
    return response;
  } catch (err) {
    const cached = await caches.match(event.request);
    if (cached) return cached;
    throw err;
  }
}

self.addEventListener("fetch", event => {
  const { request } = event;
  const route = classifyRequest({ url: request.url, method: request.method, mode: request.mode, workerOrigin: self.location.origin });
  switch (route.kind) {
    case "owner-shell": return event.respondWith(ownerShell(event, route.page));
    case "immutable": return event.respondWith(immutable(event));
    case "font": return event.respondWith(staleWhileRevalidate(event));
    case "static": return event.respondWith(networkFirst(event));
    default: return; // passthrough: the browser handles it as if there were no worker
  }
});
