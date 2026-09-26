// Each page also needs run_worker_first paths in wrangler.jsonc, or its shell skips the session check.
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
  sync: "/sync/index.html",
  account: "/account/index.html",
  "account/edit": "/account/edit/index.html",
  "account/import": "/account/import/index.html",
  "account/beta": "/account/beta/index.html",
};

// The username is left percent-encoded, exactly as in the URL.
export function matchOwnerRoute(pathname) {
  if (!pathname.startsWith("/")) return null;
  const trimmed = pathname.endsWith("/") ? pathname.slice(1, -1) : pathname.slice(1);
  const slash = trimmed.indexOf("/");
  if (slash <= 0) return null;
  const username = trimmed.slice(0, slash);
  const page = trimmed.slice(slash + 1);
  return Object.hasOwn(SHELL_PATHS, page) ? { username, page } : null;
}

// The service worker caches a shell only when this names its page, so never an error or redirect.
export const SHELL_HEADER = "X-Logbook-Shell";
