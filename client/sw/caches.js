// #962, ADR-0028 -- one Cache Storage cache per build. The name carries the
// build ID, so a deploy switches the whole worker cache at once; activation
// keeps the current and previous build's caches (an open tab from the last
// build keeps working) and deletes every other logbook-* cache.
const PREFIX = "logbook-";

export function cacheNameFor(buildId) {
  return `${PREFIX}${buildId}`;
}

export function isWorkerCache(name) {
  return name.startsWith(PREFIX);
}

// A cache named by this scheme (logbook-<build id>), as opposed to older
// logbook-* caches such as the retired /logbook/ worker's logbook-shell-v3.
const BUILD_CACHE = /^logbook-[0-9a-f]{16}$/;

export function isBuildCache(name) {
  return BUILD_CACHE.test(name);
}

// Names to delete on activate: every logbook-* cache except the current
// one and the most recent *build* cache before it (so an open tab from the
// last build keeps working). `keys` is caches.keys(), which returns names
// in creation order. Caches that aren't ours are never touched.
export function cachesToDelete(keys, currentName) {
  const others = keys.filter(name => isWorkerCache(name) && name !== currentName);
  const previous = others.filter(isBuildCache).at(-1);
  return others.filter(name => name !== previous);
}
