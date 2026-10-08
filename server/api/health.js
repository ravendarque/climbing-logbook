import { json } from "../lib/json.js";
import { appVersion } from "../lib/log.js";

const READY_CACHE_MS = 15_000;
const D1_TIMEOUT_MS = 2_000;
const NO_STORE = { "Cache-Control": "no-store" };

// One D1 read per isolate per window, so a flood of checks can't become a flood of queries.
let lastReady = { at: 0, ok: false };

export function resetReadinessCache() {
  lastReady = { at: 0, ok: false };
}

export function handleLiveness(env) {
  return json({ ok: true, version: appVersion(env) }, 200, NO_STORE);
}

async function d1Answers(env) {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error("D1 readiness timeout")), D1_TIMEOUT_MS),
  );
  await Promise.race([env.LOGBOOK_DB.prepare("SELECT 1").first(), timeout]);
}

export async function handleReadiness(env, log) {
  const now = Date.now();
  if (now - lastReady.at >= READY_CACHE_MS) {
    try {
      await d1Answers(env);
      lastReady = { at: now, ok: true };
    } catch (err) {
      lastReady = { at: now, ok: false };
      log.warn("health.ready.failed", { code: "d1", err });
    }
  }
  if (lastReady.ok) return json({ ok: true, version: appVersion(env) }, 200, NO_STORE);
  return json({ ok: false, check: "d1" }, 503, NO_STORE);
}
