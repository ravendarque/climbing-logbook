// #955, ADR-0029 -- app pages log in on their own origin, never the apex:
// an installed app (my.x or beta.x) keeps its own cookie jar on iOS, so a
// login that navigates out of the app's scope may never reach it. The
// login page (static/login/login.js) sends the visitor back to returnTo
// afterwards when it's one of their own pages. Mirrored server-side by
// server/api/owned-routes.js's loginRedirect() for unauthenticated owner
// routes.
export const LOGIN_PATH = "/-/login/";

// The login page URL that returns to where the visitor is now.
export function loginPageUrl(loc = window.location) {
  return `${LOGIN_PATH}?returnTo=${encodeURIComponent(loc.pathname + loc.search)}`;
}
