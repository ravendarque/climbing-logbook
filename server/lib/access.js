// Checked as well as Access itself, so a misconfigured Access application can't open the admin host (ADR-0034).

const KEYS_TTL_MS = 60 * 60 * 1000;
const CLOCK_SKEW_S = 60;

/** @type {{ teamDomain: string, keys: Array<JsonWebKey & { kid?: string }>, at: number } | null} */
let cachedKeys = null;

function base64UrlToBytes(value) {
  const base64 = value
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(base64), char => char.charCodeAt(0));
}

function decodeJson(part) {
  return JSON.parse(new TextDecoder().decode(base64UrlToBytes(part)));
}

async function fetchKeys(teamDomain, fetchImpl) {
  const res = await fetchImpl(`https://${teamDomain}/cdn-cgi/access/certs`);
  if (!res.ok) return [];
  const { keys } = await res.json();
  cachedKeys = { teamDomain, keys: Array.isArray(keys) ? keys : [], at: Date.now() };
  return cachedKeys.keys;
}

// Keys rotate, so a kid the cache doesn't know fetches them again.
async function findKey(kid, teamDomain, fetchImpl) {
  const fresh = cachedKeys && cachedKeys.teamDomain === teamDomain && Date.now() - cachedKeys.at < KEYS_TTL_MS;
  const cached = fresh ? cachedKeys?.keys.find(key => key.kid === kid) : undefined;
  if (cached) return cached;
  return (await fetchKeys(teamDomain, fetchImpl)).find(key => key.kid === kid);
}

export async function verifyAccessJwt(token, { teamDomain, aud, fetchImpl = fetch, nowS = Date.now() / 1000 }) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return false;
    const [headerPart, payloadPart, signaturePart] = parts;
    const header = decodeJson(headerPart);
    if (header.alg !== "RS256" || !header.kid) return false;

    const jwk = await findKey(header.kid, teamDomain, fetchImpl);
    if (!jwk) return false;
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, [
      "verify",
    ]);
    const signed = new TextEncoder().encode(`${headerPart}.${payloadPart}`);
    if (!(await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, base64UrlToBytes(signaturePart), signed))) return false;

    const payload = decodeJson(payloadPart);
    const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!audiences.includes(aud)) return false;
    if (payload.iss !== `https://${teamDomain}`) return false;
    if (typeof payload.exp !== "number" || payload.exp + CLOCK_SKEW_S < nowS) return false;
    if (typeof payload.nbf === "number" && payload.nbf - CLOCK_SKEW_S > nowS) return false;
    return true;
  } catch {
    return false;
  }
}

// Off only where the e2e or local dev environment says so; with no team or audience configured, nothing passes.
export function verifyAccessRequest(request, env, options = {}) {
  if (env.ADMIN_ACCESS_CHECK === "off") return Promise.resolve(true);
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token || !env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) return Promise.resolve(false);
  return verifyAccessJwt(token, { teamDomain: env.ACCESS_TEAM_DOMAIN, aud: env.ACCESS_AUD, ...options });
}

export function clearAccessKeyCache() {
  cachedKeys = null;
}
