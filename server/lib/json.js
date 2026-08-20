export function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}

// Shared by every handler that parses a request body (d1-resource.js's
// handlePost, logbook.js's handlePut, settings.js's handlePatchSettings)
// -- the identical try/catch-and-400 was hand-copied at each call site
// (found via code review, 2026-08-09). Returns a discriminated result
// rather than throwing: { ok: true, body } on success, { ok: false,
// response } with a ready-to-return 400 on failure, so a caller never
// needs its own try/catch, just `if (!parsed.ok) return parsed.response`.
export async function parseJsonBody(request) {
  try {
    return { ok: true, body: await request.json() };
  } catch {
    return { ok: false, response: json({ error: "Invalid JSON" }, 400) };
  }
}
