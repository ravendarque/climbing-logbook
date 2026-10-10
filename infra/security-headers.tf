# Security headers on every response (#1042). The Worker sends the CSP itself, so Cloudflare can nonce its injected script.
resource "cloudflare_ruleset" "security_headers" {
  zone_id     = data.cloudflare_zone.app.id
  kind        = "zone"
  phase       = "http_response_headers_transform"
  name        = "Security headers"
  description = "Framing, referrer, permissions and opener policy on every response; the Worker sends the CSP (#1042)"

  rules = [
    {
      description = "Security headers"
      expression  = "true"
      action      = "rewrite"
      action_parameters = {
        headers = {
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
