const MAX_BODY_BYTES = 16 * 1024;
const MAX_VIOLATIONS_LOGGED = 3;

// Stops at the cap instead of buffering whatever a client sends.
async function readCapped(request) {
  if (Number(request.headers.get("Content-Length")) > MAX_BODY_BYTES) return null;
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(await new Blob(chunks).arrayBuffer());
}

function originOf(uri) {
  if (!uri) return undefined;
  try {
    return new URL(uri).origin;
  } catch {
    return String(uri).slice(0, 32);
  }
}

// Both report formats: the legacy `csp-report` object and the Reporting API's array of `csp-violation` reports.
function violationsIn(body) {
  if (body?.["csp-report"]) return [body["csp-report"]];
  if (Array.isArray(body)) return body.filter(report => report?.type === "csp-violation").map(report => report.body);
  return [];
}

// Only the directive and the blocked origin are kept: a full URL can carry a username or a token.
export async function handleCspReport(request, env, log) {
  if (env.RATE_LIMITING_ENABLED === "true") {
    const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
    const { success } = await env.CSP_REPORT_LIMITER.limit({ key: ip });
    if (!success) return new Response(null, { status: 429 });
  }
  const text = await readCapped(request);
  if (text === null) return new Response(null, { status: 413 });
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return new Response(null, { status: 400 });
  }
  for (const violation of violationsIn(body).slice(0, MAX_VIOLATIONS_LOGGED)) {
    log.warn("csp.violation", {
      directive: violation["effective-directive"] ?? violation.effectiveDirective ?? violation["violated-directive"],
      blocked: originOf(violation["blocked-uri"] ?? violation.blockedURL),
    });
  }
  return new Response(null, { status: 204 });
}
