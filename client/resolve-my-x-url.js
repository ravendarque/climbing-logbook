// Pure "opted out on the beta.x gate -> equivalent my.x URL" logic
// (#443/#548, ADR-0020). Mirrors public/login/resolve-app-origin.js's
// same real-apex-only reasoning, opposite direction: swaps the current
// beta.<domain> hostname for my.<domain>, falling back to the current
// same-origin path everywhere else (local dev/PR previews never arrived
// here from a real beta.<domain> in the first place, so there's nothing
// to swap).
export function resolveMyXUrl(hostname, pathname) {
  if (hostname !== "beta.climbinglogbook.com") return pathname;
  return `https://my.climbinglogbook.com${pathname}`;
}
