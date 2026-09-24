// #947, ADR-0028 -- what the worker may put in its cache, as pure
// functions (unit-tested in test/client/sw/responses.test.js).
import { SHELL_HEADER, SHELL_PATHS } from "../../shared/owner-routes.js";

// One cached shell per page type, not per user (the shell HTML is
// identical for everyone): keyed by the page's shell file path, e.g.
// /log/index.html -- the same key #948's pre-cache writes.
export function shellCacheKey(page, origin) {
  return new URL(SHELL_PATHS[page], origin).toString();
}

// A navigation response is only ever cached as `page`'s shell when the
// server said that's exactly what it is (#959): ok, not a redirect, and
// carrying SHELL_HEADER naming that page. An interstitial, an error page,
// a login redirect or anything else served at an owner URL never is.
export function isCacheableShell(response, page) {
  return response.ok && !response.redirected && response.type !== "opaqueredirect"
    && response.headers.get(SHELL_HEADER) === page;
}

// Static assets: only successful, same-origin responses.
export function isCacheableAsset(response) {
  return response.ok && response.type === "basic";
}
