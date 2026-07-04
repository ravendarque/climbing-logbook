/**
 * Stateless HMAC-signed session cookie auth.
 * No server-side session storage — the cookie carries an expiry + a
 * signature (keyed on env.ADMIN_KEY) that we re-derive to verify it.
 */

const COOKIE_NAME = "logbook_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

async function hmac(key, message) {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(message));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");
}

// Constant-time string comparison. Hashes both sides to a fixed-length
// digest first so neither length nor content is leaked via early exit.
export async function timingSafeEqual(a, b) {
  const enc = new TextEncoder();
  const [aDigest, bDigest] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  const aBytes = new Uint8Array(aDigest);
  const bBytes = new Uint8Array(bDigest);
  let diff = 0;
  for (let i = 0; i < aBytes.length; i++) diff |= aBytes[i] ^ bBytes[i];
  return diff === 0;
}

export async function createSessionCookie(adminKey) {
  const expiry = Date.now() + SESSION_TTL_SECONDS * 1000;
  const sig = await hmac(adminKey, String(expiry));
  const token = `${expiry}.${sig}`;
  return `${COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_SECONDS}`;
}

export function clearSessionCookie() {
  return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

function getCookie(request, name) {
  const header = request.headers.get("Cookie") || "";
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? match[1] : null;
}

export async function isAuthed(request, env) {
  const token = getCookie(request, COOKIE_NAME);
  if (!token) return false;

  const [expiryStr, sig] = token.split(".");
  const expiry = Number(expiryStr);
  if (!expiry || Date.now() > expiry) return false;

  const expectedSig = await hmac(env.ADMIN_KEY, expiryStr);
  return timingSafeEqual(sig, expectedSig);
}
