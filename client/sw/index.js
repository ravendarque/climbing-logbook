// #962, ADR-0028 -- the service worker's entry point, bundled by the
// production build (scripts/service-worker-plugin.mjs) into /sw.js with
// BUILD_ID and the pre-cache list injected. Deliberately inert for now:
// no page registers /sw.js until the runtime lands (#947), which adds the
// install/activate/fetch handlers built on classify.js and caches.js.
import { cacheNameFor } from "./caches.js";

/* global __BUILD_ID__, __PRECACHE__ */
// Kept on the global so the values survive bundling (and so the script's
// bytes change with every build whose served content changes -- that byte
// change is what makes a browser install the new worker).
self.LOGBOOK_BUILD = Object.freeze({
  id: __BUILD_ID__,
  cacheName: cacheNameFor(__BUILD_ID__),
  precache: __PRECACHE__,
});
