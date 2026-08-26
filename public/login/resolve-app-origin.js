// Pure redirect-target logic for login.js's post-sign-in redirect
// (#443/#547, ADR-0020). Extracted into its own file so it's testable via
// plain Vitest without a DOM -- login.js itself can't be imported
// directly into a test (workerd, this project's only Vitest pool, has no
// DOM at all; see ADR-0011/#414's own documented gap for the general
// case). Lives alongside login.js in public/login/, not client/shared/,
// since only public/ is servable as a static asset and login.js is
// intentionally outside the bundled client/*.js module graph (see
// login.js's own header comment) -- a relative import within public/
// works natively in the browser with no bundler involved, same as any
// other native ES module import.
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
