// Same-origin login: an installed iOS app keeps its own cookie jar.
export const LOGIN_PATH = "/-/login/";

// The login page URL that returns to where the visitor is now.
export function loginPageUrl(loc = window.location) {
  return `${LOGIN_PATH}?returnTo=${encodeURIComponent(loc.pathname + loc.search)}`;
}
