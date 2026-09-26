// Off the real domains, everything stays same-origin.
export function resolveMyXUrl(hostname, pathname) {
  if (hostname !== "beta.climbinglogbook.com") return pathname;
  return `https://my.climbinglogbook.com${pathname}`;
}

// Joining takes you straight to beta, rather than just updating a label.
export function resolveBetaXUrl(hostname, pathname) {
  if (hostname !== "my.climbinglogbook.com") return pathname;
  return `https://beta.climbinglogbook.com${pathname}`;
}

export function resolveApexUrl(hostname, pathname) {
  if (hostname !== "my.climbinglogbook.com" && hostname !== "beta.climbinglogbook.com") return pathname;
  return `https://climbinglogbook.com${pathname}`;
}
