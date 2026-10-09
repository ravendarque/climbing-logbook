# Security headers on every response, static or Worker-built (#1042). Report-only until a clean soak; then rename the header.
locals {
  content_security_policy = join("; ", [
    "default-src 'self'",
    "script-src 'self' https://challenges.cloudflare.com",
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
  ])
}

resource "cloudflare_ruleset" "security_headers" {
  zone_id     = data.cloudflare_zone.app.id
  kind        = "zone"
  phase       = "http_response_headers_transform"
  name        = "Security headers"
  description = "CSP, framing, referrer, permissions and opener policy on every response (#1042)"

  rules = [
    {
      description = "Security headers"
      expression  = "true"
      action      = "rewrite"
      action_parameters = {
        headers = {
          "Content-Security-Policy-Report-Only" = { operation = "set", value = local.content_security_policy }
          "Reporting-Endpoints"                 = { operation = "set", value = "csp=\"/-/csp-report\"" }
          "X-Frame-Options"                     = { operation = "set", value = "DENY" }
          "Referrer-Policy"                     = { operation = "set", value = "strict-origin-when-cross-origin" }
          "Permissions-Policy"                  = { operation = "set", value = "camera=(), microphone=(), geolocation=(), payment=(), usb=()" }
          "Cross-Origin-Opener-Policy"          = { operation = "set", value = "same-origin" }
        }
      }
    }
  ]
}
