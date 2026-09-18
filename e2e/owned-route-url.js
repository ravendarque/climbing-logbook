// Every :username-owned route (server/api/owned-routes.js -- /log, /map,
// /performance, /account, /sync, etc.) only resolves under the my.<host>
// subdomain; bare localhost falls through to static-asset serving and
// 404s with no hint why. Every other spec in this suite goes through the
// /e2e-fixtures/ harness instead and never needs this at all -- this
// helper exists specifically for the rarer spec (like log-page-boot-
// perf.spec.js) that deliberately hits a real owned route, so the my.
// prefix is supplied by construction instead of needing to be
// remembered at each call site (found live, 2026-09-19, after getting
// this exact URL wrong twice in the same session).
const PORT = 8787;

export function ownedRouteUrl(username, path) {
  return `http://my.localhost:${PORT}/${username}${path}`;
}

// The bootstrapped dev session's own cookie (globalSetup.js's storageState,
// applied globally via playwright.config.js's use.storageState) is scoped
// to plain `localhost` -- the host bootstrapDevSession() actually logged
// in against. Cookies don't follow across distinct hosts just because one
// looks like a subdomain of the other, so a context that only has that
// cookie gets redirected to /login the moment it navigates to
// my.localhost, even with a genuinely valid session. Call this before
// navigating to a real owned route (ownedRouteUrl() above) to add the
// same token, scoped to my.localhost too, without re-authenticating.
export async function addOwnedRouteSessionCookie(context) {
  const [cookie] = await context.cookies("http://localhost:8787");
  await context.addCookies([{ ...cookie, domain: "my.localhost" }]);
}
