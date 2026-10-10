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

# Made in the dashboard when Resend was set up; reject once only Resend sends as the domain (#1053).
import {
  to = cloudflare_dns_record.dmarc
  id = "${data.cloudflare_zone.app.id}/5abd7435f01c64cd75d6df3950588e7d"
}

resource "cloudflare_dns_record" "dmarc" {
  zone_id = data.cloudflare_zone.app.id
  name    = "_dmarc.${var.app_zone_name}"
  type    = "TXT"
  ttl     = 1
  content = "\"v=DMARC1; p=reject; rua=mailto:bba2e499007448e7a1b0b7b949d184e9@dmarc-reports.cloudflare.net\""
}
