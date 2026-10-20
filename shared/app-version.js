// A release tag, or "dev" for a build that isn't one.
export const APP_VERSION = /^(v\d+\.\d+\.\d+|dev)$/;

export const validAppVersion = value => (typeof value === "string" && APP_VERSION.test(value) ? value : undefined);

// Which app a report came from, by the host of the page it was sent from.
export function environmentOf(sourcePage) {
  if (!sourcePage) return null;
  let host;
  try {
    host = new URL(sourcePage).hostname;
  } catch {
    return null;
  }
  if (host === "beta.climbinglogbook.com") return "Beta";
  if (host === "my.climbinglogbook.com" || host === "climbinglogbook.com") return "Production";
  return "Other";
}
