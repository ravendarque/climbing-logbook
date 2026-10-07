# The admin host (ADR-0034): Access in front of the whole hostname, letting in one email.
resource "cloudflare_dns_record" "app_admin_subdomain" {
  zone_id = data.cloudflare_zone.app.id
  name    = "admin.${var.app_zone_name}"
  type    = "A"
  content = "192.0.2.1"
  ttl     = 1
  proxied = true
  comment = "Placeholder for the admin host's Worker Route (#1268) -- traffic never actually reaches this IP."

  lifecycle {
    prevent_destroy = true
  }
}

resource "cloudflare_zero_trust_access_policy" "admin_email" {
  account_id = var.cloudflare_account_id
  name       = "Allow the logbook admin"
  decision   = "allow"

  include = [{
    email = {
      email = var.admin_email
    }
  }]
}

resource "cloudflare_zero_trust_access_application" "admin" {
  account_id       = var.cloudflare_account_id
  name             = "Climbing Logbook Admin"
  domain           = "admin.${var.app_zone_name}"
  type             = "self_hosted"
  session_duration = "24h"

  policies = [{
    id         = cloudflare_zero_trust_access_policy.admin_email.id
    precedence = 1
  }]
}
