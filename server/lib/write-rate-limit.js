import { WRITES_PER_MINUTE } from "../../shared/account-limits.js";
import { json } from "./json.js";

// Keyed by account, not IP, and counted at the edge, so it writes nothing to D1 (#1045).
export async function limitWrite(env, userId) {
  if (env.RATE_LIMITING_ENABLED !== "true") return null;
  const { success } = await env.WRITE_RATE_LIMITER.limit({ key: userId });
  if (success) return null;
  return json({ error: `You can save up to ${WRITES_PER_MINUTE} changes a minute. Try again shortly.` }, 429, {
    "Retry-After": "60",
  });
}
