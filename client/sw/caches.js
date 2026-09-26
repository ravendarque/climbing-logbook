// One cache per build; activation keeps this build's and the previous one's.
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

// Everything logbook-* except this build and the previous build; others' caches untouched.
export function cachesToDelete(keys, currentName) {
  const others = keys.filter(name => isWorkerCache(name) && name !== currentName);
  const previous = others.filter(isBuildCache).at(-1);
  return others.filter(name => name !== previous);
}
