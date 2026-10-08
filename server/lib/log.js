// An allowlist, not a denylist: a field nobody has vetted never reaches the logs (#1027).
const ALLOWED_FIELDS = new Set([
  "event",
  "level",
  "ray",
  "route",
  "method",
  "status",
  "durationMs",
  "env",
  "version",
  "userId",
  "err",
  "ref",
  "colo",
  "country",
  "code",
  "reason",
  "count",
]);

const SINKS = { debug: "log", info: "log", warn: "warn", error: "error" };

function serialiseError(err) {
  if (!(err instanceof Error)) return { name: "NonError", message: String(err) };
  return { name: err.name, message: err.message, stack: err.stack };
}

export function redact(fields) {
  const safe = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    if (!ALLOWED_FIELDS.has(key)) safe[key] = "[redacted]";
    else safe[key] = key === "err" ? serialiseError(value) : value;
  }
  return safe;
}

export function appVersion(env) {
  return env.CF_VERSION_METADATA?.tag || env.CF_VERSION_METADATA?.id || "dev";
}

/** @param {{ request?: Request, env?: any, route?: string }} [options] */
export function createLogger(options = {}) {
  const { request, env = {}, route } = options;
  const base = {
    env: env.APP_ENV ?? "development",
    version: appVersion(env),
    ray: request?.headers.get("cf-ray") ?? undefined,
    method: request?.method,
    route,
    colo: /** @type {any} */ (request)?.cf?.colo,
    country: /** @type {any} */ (request)?.cf?.country,
  };
  const emit = (level, event, fields = {}) =>
    console[SINKS[level]](JSON.stringify(redact({ ...base, ...fields, event, level })));
  return {
    debug: (event, fields) => emit("debug", event, fields),
    info: (event, fields) => emit("info", event, fields),
    warn: (event, fields) => emit("warn", event, fields),
    error: (event, fields) => emit("error", event, fields),
  };
}
