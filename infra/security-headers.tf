# Security headers on every response, static or Worker-built (#1042). Report-only until a clean soak; then rename the header.
# Cloudflare adds the per-response nonce to the Bot Fight Mode script it injects into HTML; our own scripts are files.
locals {
  csp_before_nonce = "default-src 'self'; script-src 'self' 'nonce-"
  csp_after_nonce = join("; ", [
    "' https://challenges.cloudflare.com",
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
      description = "Enforce the CSP on one page, to learn whether Cloudflare nonces its injected script (#1042)"
      expression  = "http.request.uri.path eq \"/help/terms/\""
      action      = "rewrite"
      action_parameters = {
        headers = {
          "Content-Security-Policy" = {
            operation  = "set"
            expression = "concat(\"${local.csp_before_nonce}\", uuidv4(cf.random_seed), \"${local.csp_after_nonce}\")"
          }
        }
      }
    },
    {
      description = "Security headers"
      expression  = "true"
      action      = "rewrite"
      action_parameters = {
        headers = {
          "Content-Security-Policy-Report-Only" = {
            operation  = "set"
            expression = "concat(\"${local.csp_before_nonce}\", uuidv4(cf.random_seed), \"${local.csp_after_nonce}\")"
          }
          "Reporting-Endpoints"        = { operation = "set", value = "csp=\"/-/csp-report\"" }
          "X-Frame-Options"            = { operation = "set", value = "DENY" }
          "Referrer-Policy"            = { operation = "set", value = "strict-origin-when-cross-origin" }
          "Permissions-Policy"         = { operation = "set", value = "camera=(), microphone=(), geolocation=(), payment=(), usb=()" }
          "Cross-Origin-Opener-Policy" = { operation = "set", value = "same-origin" }
        }
      }
    }
  ]
}
