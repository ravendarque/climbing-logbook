// Pure redirect-target logic for login.js's post-sign-in redirect
// (#443/#547, ADR-0020). Extracted into its own file so it's testable via
// plain Vitest without a DOM -- login.js itself can't be imported
// directly into a test (workerd, this project's only Vitest pool, has no
// DOM at all; see ADR-0011/#414's own documented gap for the general
// case). Lives alongside login.js in static/login/ (#877 -- passed
// through unchanged into public/login/, the servable path), not
// client/shared/, since login.js is intentionally outside the bundled
// client/*.js module graph (see login.js's own header comment) -- a
// relative import within public/ works natively in the browser with no
// bundler involved, same as any other native ES module import.
//
// hostname: window.location.hostname, passed in rather than read
// directly so this stays a pure function, trivially testable.
// betaOptIn: the settings value exactly as read off the wire (server/
// api/settings.js's own rowToJson) -- null (never decided) and false
// (opted out) both mean "don't redirect to beta", only a literal `true`
// does. Same same-origin-locally fallback APP_ORIGIN's own pre-#547
// logic already had for local dev/PR previews (no real beta.<domain> to
// send a browser to there either).
export function resolveAppOrigin(hostname, betaOptIn) {
  if (hostname !== "climbinglogbook.com") return "";
  return betaOptIn === true ? "https://beta.climbinglogbook.com" : "https://my.climbinglogbook.com";
}

// #955, ADR-0029 -- app pages (my.x, beta.x) now send visitors to their
// *own* origin's /login/ with ?returnTo=<path>, so logging in never leaves
// an installed app's scope (iOS home-screen apps keep a cookie jar separate
// from Safari's; a cross-origin login may never reach the app). The apex's
// login is still where the enrolled-user beta redirect happens.
const APEX_HOSTNAME = "climbinglogbook.com";

// Only the apex needs the settings read that resolveAppOrigin's betaOptIn
// argument comes from -- every other host logs in and lands on itself.
export function needsChannelChoice(hostname) {
  return hostname === APEX_HOSTNAME;
}

// A returnTo value is only ever used as a same-origin path. Anything that
// could leave the origin (scheme, protocol-relative "//", backslash tricks
// browsers normalise to "/", control characters) is rejected outright,
// then the resolved URL's origin is checked as a final guard.
export function safeReturnTo(value, origin) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return null;
  if (value.includes("\\") || /[\u0000-\u001f\u007f]/.test(value)) return null;
  let url;
  try { url = new URL(value, origin); } catch { return null; }
  if (url.origin !== origin) return null;
  return url.pathname + url.search + url.hash;
}

// Where a signed-in user goes after the login page:
// - on an app host, back to returnTo if it's one of *their own* pages (its
//   first path segment is their username, compared case-insensitively like
//   the server's username lookup). Someone else's page would only bounce
//   back to login, so it's ignored rather than followed;
// - otherwise their own /log, on the origin resolveAppOrigin picks (beta
//   for an enrolled user on the apex, else my.x; same-origin off the apex).
export function resolvePostLoginTarget({ hostname, origin, username, returnTo, betaOptIn }) {
  if (!needsChannelChoice(hostname)) {
    const path = safeReturnTo(returnTo, origin);
    if (path && ownsPath(path, username)) return path;
  }
  return `${resolveAppOrigin(hostname, betaOptIn)}/${username}/log`;
}

function ownsPath(path, username) {
  const first = path.split("/")[1] ?? "";
  let decoded;
  try { decoded = decodeURIComponent(first); } catch { return false; }
  return typeof username === "string" && username !== "" && decoded.toLowerCase() === username.toLowerCase();
}
