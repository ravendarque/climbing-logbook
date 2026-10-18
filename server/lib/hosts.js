const APP_HOSTS = new Set(["my.climbinglogbook.com", "beta.climbinglogbook.com"]);

export const isRealDomain = hostname =>
  hostname === "climbinglogbook.com" || hostname?.endsWith(".climbinglogbook.com");
export const isLocalHost = hostname => hostname === "localhost" || hostname?.endsWith(".localhost");

export function apexOrigin(requestUrl) {
  const url = new URL(requestUrl);
  return APP_HOSTS.has(url.hostname) ? "https://climbinglogbook.com" : url.origin;
}

// Owner pages live on my.; locally that's my.localhost on the same port.
export function ownedPageUrl(requestUrl, username, path) {
  const url = new URL(requestUrl);
  let host = url.host;
  if (isRealDomain(url.hostname)) host = "my.climbinglogbook.com";
  else if (isLocalHost(url.hostname)) host = url.host.replace(/^(my\.|beta\.)?/, "my.");
  return `${url.protocol}//${host}/${encodeURIComponent(username)}/${path}`;
}
