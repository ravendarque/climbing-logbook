import { json } from "./json.js";

// A bare Number() let "abc" through as NaN and a negative LIMIT mean "no limit" in SQLite.
/**
 * @param {URL} url
 * @param {string} name
 * @param {{ min?: number, max?: number, fallback?: number }} [options]
 * @returns {{ value: number, response?: undefined } | { response: Response, value?: undefined }}
 */
export function intParam(url, name, { min = 0, max = Number.MAX_SAFE_INTEGER, fallback } = {}) {
  const raw = url.searchParams.get(name);
  if (raw === null && fallback !== undefined) return { value: fallback };
  const value = raw === null || raw === "" ? Number.NaN : Number(raw);
  if (Number.isInteger(value) && value >= min && value <= max) return { value };
  return { response: json({ error: `${name} must be a whole number from ${min} to ${max}` }, 400) };
}
