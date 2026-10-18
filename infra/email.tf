# support@ is the contact account emails give (#1280, #1365), a Proton Mail mailbox (#1444); it's never published on the site.
import {
  to = cloudflare_dns_record.proton_verification
  id = "${data.cloudflare_zone.app.id}/f777e54d1be62620b46ec8d26f914b66"
}

resource "cloudflare_dns_record" "proton_verification" {
  zone_id = data.cloudflare_zone.app.id
  name    = var.app_zone_name
  type    = "TXT"
  ttl     = 1
  content = "\"protonmail-verification=fe96490b1f1ddc48374942ffa3fef4aecdcdddcf\""
}

# Only after Email Routing is off (#1444 phase 1): disabling it deletes the root MX and SPF, even edited ones.
resource "cloudflare_dns_record" "proton_mx" {
  for_each = { "mail.protonmail.ch" = 10, "mailsec.protonmail.ch" = 20 }
  zone_id  = data.cloudflare_zone.app.id
  name     = var.app_zone_name
  type     = "MX"
  ttl      = 1
  priority = each.value
  content  = each.key
}

resource "cloudflare_dns_record" "root_spf" {
  zone_id = data.cloudflare_zone.app.id
  name    = var.app_zone_name
  type    = "TXT"
  ttl     = 1
  content = "\"v=spf1 include:_spf.protonmail.ch ~all\""
}

resource "cloudflare_dns_record" "proton_dkim" {
  for_each = toset(["protonmail", "protonmail2", "protonmail3"])
  zone_id  = data.cloudflare_zone.app.id
  name     = "${each.key}._domainkey.${var.app_zone_name}"
  type     = "CNAME"
  ttl      = 1
  proxied  = false
  content  = "${each.key}.domainkey.drsvvi26oveh5kvolngnll7dtopfd2anzc73r2le4vdjz6rb4tw6q.domains.proton.ch"
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

# Resend's sending domain (#1336): the bounce MX and SPF on send., and the DKIM key it signs with.
import {
  to = cloudflare_dns_record.resend_bounce_mx
  id = "${data.cloudflare_zone.app.id}/787e5916c3fa5f2cb4291bb3701c8c91"
}

resource "cloudflare_dns_record" "resend_bounce_mx" {
  zone_id  = data.cloudflare_zone.app.id
  name     = "send.${var.app_zone_name}"
  type     = "MX"
  ttl      = 3600
  priority = 10
  content  = "feedback-smtp.eu-west-1.amazonses.com"

  lifecycle {
    prevent_destroy = true
  }
}

import {
  to = cloudflare_dns_record.resend_spf
  id = "${data.cloudflare_zone.app.id}/6898ae3d2fa3eae84f3bbe3b86e2ad0b"
}

resource "cloudflare_dns_record" "resend_spf" {
  zone_id = data.cloudflare_zone.app.id
  name    = "send.${var.app_zone_name}"
  type    = "TXT"
  ttl     = 3600
  content = "\"v=spf1 include:amazonses.com ~all\""

  lifecycle {
    prevent_destroy = true
  }
}

import {
  to = cloudflare_dns_record.resend_dkim
  id = "${data.cloudflare_zone.app.id}/29ca1f1b1974c701711f7795c5bcd15a"
}

resource "cloudflare_dns_record" "resend_dkim" {
  zone_id = data.cloudflare_zone.app.id
  name    = "resend._domainkey.${var.app_zone_name}"
  type    = "TXT"
  ttl     = 3600
  content = "\"v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC3a9eWtmBUjvv50VN6dgj7/O8b/fnCMNqGI+gPiKstst1XP6/y8NuzqPsbpGvJQkiYVRAfbjR988+pk81yBxGNtIHGdsNkhX+CP5mTmBwrHFjuA8o4ssRWLptUzmF9cFqppX5jYkft75OQUvoAaTmgt/JQ54MFfJnlU/RsDZPPcQIDAQAB\""

  lifecycle {
    prevent_destroy = true
  }
}
