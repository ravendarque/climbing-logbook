export function contentSecurityPolicy(nonce) {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' https://challenges.cloudflare.com`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "frame-src https://challenges.cloudflare.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "report-uri /-/csp-report",
    "report-to csp",
  ].join("; ");
}

// Cloudflare only nonces its injected script when the origin sends the CSP, so the Worker has to (#1042).
export function withContentSecurityPolicy(response) {
  const withHeader = new Response(response.body, response);
  withHeader.headers.set("Content-Security-Policy", contentSecurityPolicy(crypto.randomUUID()));
  return withHeader;
}
