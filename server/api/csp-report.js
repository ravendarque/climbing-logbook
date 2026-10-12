import { clientKey } from "../lib/rate-limits.js";
import { routeTemplate } from "../lib/route-template.js";
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

function pageOf(uri) {
  try {
    return routeTemplate(new URL(uri), []);
  } catch {
    return undefined;
  }
}

function originOf(uri) {
  if (!uri) return undefined;
  try {
    const url = new URL(uri);
    // Extension URLs have an opaque origin, so their scheme and id stand in for it.
    return url.origin === "null" ? `${url.protocol}//${url.host}` : url.origin;
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

// Only the directive, the blocked and source origins, and the page's route template are kept: a full URL can carry a username or a token.
export async function handleCspReport(request, env, log) {
  if (env.RATE_LIMITING_ENABLED === "true") {
    const { success } = await env.CSP_REPORT_LIMITER.limit({ key: clientKey(request) });
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
      page: pageOf(violation["document-uri"] ?? violation.documentURL),
      source: originOf(violation["source-file"] ?? violation.sourceFile),
    });
  }
  return new Response(null, { status: 204 });
}
