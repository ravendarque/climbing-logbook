// Shared by public/index.html (apex marketing page) and
// public/login/index.html (#352) -- both need the identical "already
// logged in? skip me, go straight to /log" check. Outside client/'s
// module graph deliberately, same reasoning public/login/login.js's own
// header comment already gives for that page -- this runs on two pages
// that have nothing else to do with the authenticated app's module graph.
//
// contentEl stays hidden (inline style, set by each page's own markup)
// until this resolves -- a real network round trip, so it can't be
// synchronous-before-paint the way the theme-bootstrap script is; a
// flash-then-redirect would be worse than a brief loading gate.
//
// Cookie sharing across climbinglogbook.com/my.climbinglogbook.com is
// already configured (server/lib/auth.js's crossSubDomainCookies), so this
// same-origin get-session call sees a session established on either
// hostname regardless of which one this script runs on.
import { needsChannelChoice, resolvePostLoginTarget } from "./login/resolve-app-origin.js";

export async function redirectIfLoggedIn(contentEl) {
  try {
    const res = await fetch("/-/api/auth/get-session");
    const data = await res.json();
    if (data?.user) {
      // #443/#547/#559, ADR-0020 -- same betaOptIn-aware target
      // login.js's own post-sign-in redirect already resolves via
      // resolveAppOrigin, reused here rather than re-deriving my.x/beta.x
      // by hand a third time. A failed/slow settings read falls back to
      // my.x, the same safe default resolveAppOrigin's own null handling
      // gives a never-decided or opted-out user.
      //
      // #955 -- same target rule as login.js after sign-in: on an app host,
      // back to returnTo when it's this user's own page, else their /log.
      // A returnTo for someone else's page is ignored, so a user already
      // signed in as someone else can't loop between that page's login
      // redirect and this one.
      let betaOptIn = null;
      if (needsChannelChoice(location.hostname)) {
        try {
          const settingsRes = await fetch("/-/api/settings");
          betaOptIn = (await settingsRes.json()).betaOptIn;
        } catch {
          // Network hiccup reading settings -- fall back to my.x below.
        }
      }
      location.href = resolvePostLoginTarget({
        hostname: location.hostname,
        origin: location.origin,
        username: data.user.username,
        returnTo: new URLSearchParams(location.search).get("returnTo"),
        betaOptIn,
      });
      return;
    }
  } catch {
    // Offline/network error -- fall through and show the page rather
    // than leaving a visitor stuck on a blank screen forever, same
    // "don't block on a check that can't complete" call
    // client/admin-auth.js's own checkSession() offline fallback makes.
  }
  contentEl.style.display = "";
}
