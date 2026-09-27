// A write someone is waiting on; background reads pass their own, longer signal (ADR-0024).
export const WRITE_TIMEOUT_MS = 10_000;

// redirect: "manual" turns an expired session's redirect to the login page into an opaqueredirect.
export function adminFetch(url, options = {}) {
  const isWrite = (options.method ?? "GET") !== "GET";
  const signal = options.signal ?? (isWrite ? AbortSignal.timeout(WRITE_TIMEOUT_MS) : undefined);
  return fetch(url, { ...options, redirect: "manual", signal });
}

export function isAuthRedirect(res) {
  return res.type === "opaqueredirect";
}
