// #958 -- the one list of owner pages (my.<domain>/:username/<page>), and
// the one matcher for them. Before this module the list lived in three
// places that had to be kept in sync by hand: SHELL_PATHS in
// server/api/owned-routes.js, plus the same page alternation hand-copied
// as a regex twice in server/index.js (my.x and beta.x). That drift was a
// real bug once already (#190: "performance/grades" stayed in the regex
// after its SHELL_PATHS entry was removed). The service worker (#945) needs
// to recognise owner-page URLs too, so a fourth copy was the alternative.
//
// Lives in shared/, not server/: it has no server-only or DOM-only
// dependencies, so the service worker bundle (#962) can import it as-is.

// #348 -- one fixed-path static shell per page type, genuinely identical
// content for every user (the client bundle reads :username off
// location.pathname itself, not server-templated). :username can't be a
// literal Workers Static Assets path, so the Worker fetches the shell
// itself via the ASSETS binding and returns it (server/api/owned-routes.js),
// rather than letting Static Assets try to match /:username/log directly
// (it can't -- static assets only match literal paths).
//
// Keys are the page path after /:username/; adding a page here is all the
// routing needs (matchOwnerRoute below derives from this object). Every
// top-level family here must also have run_worker_first entries in
// wrangler.jsonc -- test/wrangler-run-worker-first.test.js enforces it
// (#799: sync was once added here without one, leaving public/sync/
// index.html directly asset-servable with no session check).
export const SHELL_PATHS = {
  log: "/log/index.html",
  map: "/map/index.html",
  performance: "/performance/index.html",
  "performance/pyramid": "/performance/pyramid/index.html",
  "performance/injury": "/performance/injury/index.html",
  "performance/strengths": "/performance/strengths/index.html",
  "performance/trends": "/performance/trends/index.html",
  "performance/gap": "/performance/gap/index.html",
  "performance/rpe": "/performance/rpe/index.html",
  // #498 -- the cold-start/delta full-sync interstitial (ADR-0019).
  // Session-gated the same as every other owned page here -- it reads
  // the same session-scoped /logbook/api/logbook data /log itself does,
  // just before /log ever renders.
  sync: "/sync/index.html",
  // #302 -- the bare /:username/account landing page is its own entry
  // ("account", no slash) rather than a redirect to /edit.
  account: "/account/index.html",
  "account/edit": "/account/edit/index.html",
  // #224 phase 2-4 -- CSV bulk import only. Export is a separate,
  // one-click flow (#27), not part of this page -- deliberately not
  // named "account/import-export" (Raven's own correction: these are two
  // very different flows, import is the only one this story builds).
  "account/import": "/account/import/index.html",
};

// pathname → { username, page } for an owner-page URL, else null.
// Accepts exactly one optional trailing slash, and a non-empty first
// segment as the username, left exactly as it appears in the URL (not
// percent-decoded) -- the same contract the hand-written regexes in
// server/index.js had, so callers see identical values.
export function matchOwnerRoute(pathname) {
  if (!pathname.startsWith("/")) return null;
  const trimmed = pathname.endsWith("/") ? pathname.slice(1, -1) : pathname.slice(1);
  const slash = trimmed.indexOf("/");
  if (slash <= 0) return null;
  const username = trimmed.slice(0, slash);
  const page = trimmed.slice(slash + 1);
  return Object.hasOwn(SHELL_PATHS, page) ? { username, page } : null;
}

// #959, ADR-0028 -- set by the server on every response that *is* an owner
// page's shell, naming the page key (e.g. "log", "performance/rpe"). The
// service worker (#947) caches a navigation response as a page's shell only
// when this header equals the page it matched -- so an interstitial, an
// error page or a login redirect served at an owner URL can never be cached
// as "the log shell". Any page added to SHELL_PATHS gets it automatically.
export const SHELL_HEADER = "X-Logbook-Shell";
