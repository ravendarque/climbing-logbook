const MAX_BODY_BYTES = 16 * 1024;

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
export async function handleCspReport(request, log) {
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return new Response(null, { status: 413 });
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return new Response(null, { status: 400 });
  }
  for (const violation of violationsIn(body).slice(0, 10)) {
    log.warn("csp.violation", {
      directive: violation["effective-directive"] ?? violation.effectiveDirective ?? violation["violated-directive"],
      blocked: originOf(violation["blocked-uri"] ?? violation.blockedURL),
    });
  }
  return new Response(null, { status: 204 });
}
