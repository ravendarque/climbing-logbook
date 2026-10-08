import { json } from "../lib/json.js";
import { appVersion } from "../lib/log.js";

const READY_CACHE_MS = 15_000;
const D1_TIMEOUT_MS = 2_000;
const NO_STORE = { "Cache-Control": "no-store" };

// One D1 read per isolate per window, shared by every check that arrives meanwhile, so a flood can't become a flood of queries.
let lastReady = { at: 0, ok: Promise.resolve(false) };

export function resetReadinessCache() {
  lastReady = { at: 0, ok: Promise.resolve(false) };
}

export function handleLiveness(env) {
  return json({ ok: true, version: appVersion(env) }, 200, NO_STORE);
}

async function d1Answers(env, log) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("D1 readiness timeout")), D1_TIMEOUT_MS);
  });
  try {
    await Promise.race([env.LOGBOOK_DB.prepare("SELECT 1").first(), timeout]);
    return true;
  } catch (err) {
    log.warn("health.ready.failed", { code: "d1", err });
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function handleReadiness(env, log) {
  const now = Date.now();
  if (now - lastReady.at >= READY_CACHE_MS) lastReady = { at: now, ok: d1Answers(env, log) };
  if (await lastReady.ok) return json({ ok: true, version: appVersion(env) }, 200, NO_STORE);
  return json({ ok: false, check: "d1" }, 503, NO_STORE);
}
