// Only a literal true sends a user to beta. Off the real domains, stay on the same origin.
export function resolveAppOrigin(hostname, betaOptIn) {
  if (hostname !== "climbinglogbook.com") return "";
  return betaOptIn === true ? "https://beta.climbinglogbook.com" : "https://my.climbinglogbook.com";
}

// App hosts log in on their own origin: an installed iOS app keeps its own cookie jar.
const APEX_HOSTNAME = "climbinglogbook.com";

export function needsChannelChoice(hostname) {
  return hostname === APEX_HOSTNAME;
}

export function safeReturnTo(value, origin) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return null;
  if (value.includes("\\") || /[\u0000-\u001f\u007f]/.test(value)) return null;
  let url;
  try { url = new URL(value, origin); } catch { return null; }
  if (url.origin !== origin) return null;
  return url.pathname + url.search + url.hash;
}

// Someone else's page would bounce back to login, so that returnTo is ignored.
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
