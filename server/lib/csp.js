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

// Report-only until the soak is clean (#1042), then "Content-Security-Policy".
export const CSP_HEADER = "Content-Security-Policy-Report-Only";

// Cloudflare only nonces its injected bot-detection script when the origin sends the CSP, so the Worker does (#1042).
export function withContentSecurityPolicy(response) {
  if (!response.headers.get("Content-Type")?.includes("text/html")) return response;
  const withHeader = new Response(response.body, response);
  withHeader.headers.set(CSP_HEADER, contentSecurityPolicy(crypto.randomUUID()));
  return withHeader;
}
