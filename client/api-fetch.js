// A write someone is waiting on; background reads pass their own, longer signal (ADR-0024).
export const WRITE_TIMEOUT_MS = 10_000;

export function apiFetch(url, options = {}) {
  const isWrite = (options.method ?? "GET") !== "GET";
  const signal = options.signal ?? (isWrite ? AbortSignal.timeout(WRITE_TIMEOUT_MS) : undefined);
  return fetch(url, { ...options, signal });
}

// The API answers an expired or missing session with a 401, never a redirect (#992).
export function isUnauthorized(res) {
  return res.status === 401;
}
