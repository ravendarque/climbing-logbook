// Known share and tracking parameters, removed so a stored link can't identify who shared it (#1328). Only these
// go: removing anything else could break playback, and a removed parameter can't be got back. Add to it as needed.
export const TRACKING_PARAMS = new Set([
  "fbclid",
  "gclid",
  "si",
  "feature",
  "pp",
  "igsh",
  "igshid",
  "mibextid",
  "rdid",
  "sfnsn",
  "is_from_webapp",
  "sender_device",
  "_r",
  "_t",
  "web_id",
]);

const isTracking = key => key.startsWith("utm_") || TRACKING_PARAMS.has(key);

function decodedKey(pair) {
  const key = pair.split("=")[0];
  try {
    return decodeURIComponent(key.replace(/\+/g, " "));
  } catch {
    return key;
  }
}

// Every other parameter, the path and the fragment are kept exactly as written.
export function withoutTrackingParams(link) {
  if (typeof link !== "string") return link;
  const hashStart = link.indexOf("#");
  const queryStart = link.indexOf("?");
  if (queryStart === -1 || (hashStart !== -1 && queryStart > hashStart)) return link;
  const query = link.slice(queryStart + 1, hashStart === -1 ? undefined : hashStart);
  const pairs = query.split("&");
  const kept = pairs.filter(pair => pair !== "" && !isTracking(decodedKey(pair)));
  if (kept.length === pairs.length) return link;
  const fragment = hashStart === -1 ? "" : link.slice(hashStart);
  return `${link.slice(0, queryStart)}${kept.length > 0 ? `?${kept.join("&")}` : ""}${fragment}`;
}
