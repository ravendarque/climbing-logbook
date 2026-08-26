// Pure cross-hostname redirect logic for the beta.x/my.x split (#443,
// ADR-0020). Two mirror-image directions, both only ever active on the
// real production apex family -- local dev/PR previews stay same-origin
// (there's no real beta.<domain>/my.<domain> pair to swap between there).
//
// resolveMyXUrl: beta.x's opt-in gate (#548, client/beta-gate-main.js)
// on "opted out" -- send the visitor to the my.x equivalent of the page
// they were just gated out of.
export function resolveMyXUrl(hostname, pathname) {
  if (hostname !== "beta.climbinglogbook.com") return pathname;
  return `https://my.climbinglogbook.com${pathname}`;
}

// resolveBetaXUrl: the account settings entry point (#546, client/
// account-main.js) on "opted in" -- land the user on beta.x's own
// equivalent page straight away, rather than leaving them on my.x with
// just a status line update (Raven's own call, 2026-08-26 -- opting in
// should feel like it actually took you somewhere, not just flip a label).
export function resolveBetaXUrl(hostname, pathname) {
  if (hostname !== "my.climbinglogbook.com") return pathname;
  return `https://beta.climbinglogbook.com${pathname}`;
}
