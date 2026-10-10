export function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}

// A body as text and as parsed JSON, for a route that checks it and then hands the text on.
export async function readBody(request) {
  const text = await request.text();
  try {
    return { text, body: JSON.parse(text) ?? {} };
  } catch {
    return { text, body: {} };
  }
}

export async function parseJsonBody(request) {
  try {
    return { ok: true, body: await request.json() };
  } catch {
    return { ok: false, response: json({ error: "Invalid JSON" }, 400) };
  }
}
