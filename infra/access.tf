# Protects the write endpoints — /logbook/api/logbook (GET, read-only) and
# the rest of /logbook/* stay public. Only requests matching this path ever
# get intercepted by Access before reaching the Worker.
resource "cloudflare_zero_trust_access_application" "logbook_admin" {
  account_id       = var.cloudflare_account_id
  name             = "Climbing Logbook Admin"
  domain           = "${var.zone_name}/logbook/api/admin*"
  type             = "self_hosted"
  session_duration = "24h"

  policies = [{
    id         = cloudflare_zero_trust_access_policy.admin_email.id
    precedence = 1
  }]
}

resource "cloudflare_zero_trust_access_policy" "admin_email" {
  account_id = var.cloudflare_account_id
  name       = "Allow logbook admin"
  decision   = "allow"

  include = [{
    email = {
      email = var.admin_email
    }
  }]
}
