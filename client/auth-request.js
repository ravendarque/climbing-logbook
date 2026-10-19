const AUTH_BASE = "/-/api/auth";

export async function authRequest(path, body) {
  const res = await fetch(`${AUTH_BASE}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw Object.assign(new Error(data?.message || `Request failed (${res.status}).`), { code: data?.code });
  return data;
}
