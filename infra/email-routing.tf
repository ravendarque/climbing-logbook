# support@ is the contact the terms of use give (#1280); mail to it is forwarded, never published.
resource "cloudflare_email_routing_dns" "app" {
  zone_id = data.cloudflare_zone.app.id
}

resource "cloudflare_email_routing_address" "support_destination" {
  account_id = var.cloudflare_account_id
  email      = var.support_forward_email
}

resource "cloudflare_email_routing_rule" "support" {
  zone_id = data.cloudflare_zone.app.id
  name    = "Forward support@"
  enabled = true
  matchers = [{
    type  = "literal"
    field = "to"
    value = "support@${var.app_zone_name}"
  }]
  actions = [{
    type  = "forward"
    value = [cloudflare_email_routing_address.support_destination.email]
  }]
  depends_on = [cloudflare_email_routing_dns.app]
}
