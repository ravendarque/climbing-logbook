import { json } from "../lib/json.js";

const KV_KEY = "logbook:settings";

const DEFAULT_SETTINGS = { athleteMode: false };

export async function handleGetSettings(request, env) {
  const raw = await env.LOGBOOK_KV.get(KV_KEY);
  const settings = raw ? JSON.parse(raw) : DEFAULT_SETTINGS;
  return new Response(JSON.stringify(settings), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

// Reachable only via /logbook/api/admin/settings, which Cloudflare Access
// gates at the edge — an unauthenticated request never reaches this code.
export async function handlePutSettings(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  if (typeof body.athleteMode !== "boolean") {
    return json({ error: "athleteMode must be a boolean" }, 400);
  }

  const settings = { athleteMode: body.athleteMode };
  await env.LOGBOOK_KV.put(KV_KEY, JSON.stringify(settings));

  return new Response(JSON.stringify(settings), {
    headers: { "Content-Type": "application/json" },
  });
}
