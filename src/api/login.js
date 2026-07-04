import { createSessionCookie, clearSessionCookie, timingSafeEqual } from "../lib/auth.js";
import { json } from "../lib/json.js";

const MAX_ATTEMPTS = 5;
const WINDOW_SECONDS = 15 * 60;

export async function handleLogin(request, env) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const rateLimitKey = `logbook:login-attempts:${ip}`;

  const raw = await env.LOGBOOK_KV.get(rateLimitKey);
  const attempts = raw ? Number(raw) : 0;
  if (attempts >= MAX_ATTEMPTS) {
    return json({ error: "Too many attempts. Try again later." }, 429);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  if (!body.key || !(await timingSafeEqual(body.key, env.ADMIN_KEY))) {
    await env.LOGBOOK_KV.put(rateLimitKey, String(attempts + 1), { expirationTtl: WINDOW_SECONDS });
    return json({ error: "Invalid key" }, 401);
  }

  await env.LOGBOOK_KV.delete(rateLimitKey);
  const cookie = await createSessionCookie(env.ADMIN_KEY);
  return json({ ok: true }, 200, { "Set-Cookie": cookie });
}

export async function handleLogout() {
  return json({ ok: true }, 200, { "Set-Cookie": clearSessionCookie() });
}
