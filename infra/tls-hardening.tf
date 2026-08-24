# #527 -- Cloudflare's own audit (#380) of climbinglogbook.com flagged
# min TLS 1.0 still allowed, HSTS disabled, and no `www` record --
# real gaps for an app that handles login credentials. Managed here
# rather than by hand in the dashboard, matching dns.tf's existing
# Terraform-first convention for this zone.
#
# Resource/attribute names verified against the installed provider
# (`cloudflare/cloudflare ~> 5.0`) schema before writing this, not
# assumed from the audit's own raw API/curl script -- `cloudflare_zone_
# setting` (singular) is the real v5 resource name, one instance per
# setting (`setting_id`/`value`), not a single `zone_settings_override`
# block.

resource "cloudflare_zone_setting" "app_min_tls_version" {
  zone_id    = data.cloudflare_zone.app.id
  setting_id = "min_tls_version"
  value      = "1.2"
}

# `full_strict` over `full` -- no real origin exists today (192.0.2.1
# placeholder, dns.tf), so this is low-urgency in practice, but should
# already be correct in case a real origin is ever added later.
resource "cloudflare_zone_setting" "app_ssl_mode" {
  zone_id    = data.cloudflare_zone.app.id
  setting_id = "ssl"
  value      = "full_strict"
}

# HSTS -- the app is already all-HTTPS with Always Use HTTPS on, so this
# is low-risk to enable. include_subdomains covers `my.` too.
resource "cloudflare_zone_setting" "app_hsts" {
  zone_id    = data.cloudflare_zone.app.id
  setting_id = "security_header"
  value = {
    strict_transport_security = {
      enabled            = true
      max_age            = 31536000
      include_subdomains = true
      nosniff            = true
      preload            = false
    }
  }
}

# DNSSEC -- `ds` (below) is a computed output; the DS record itself has
# to be added at the domain registrar by hand (Terraform/Cloudflare have
# no API into a third-party registrar) -- see infra/README.md's one-time
# manual steps.
resource "cloudflare_zone_dnssec" "app" {
  zone_id = data.cloudflare_zone.app.id
  status  = "active"
}

output "app_dnssec_ds_record" {
  description = "DS record to add at the domain registrar once DNSSEC is active (#527) -- infra/README.md documents this as a one-time manual step."
  value       = cloudflare_zone_dnssec.app.ds
}

# `www.climbinglogbook.com` currently NXDOMAINs -- add a proxied CNAME
# to the apex plus a 301 redirect, same ruleset pattern already proven
# live in redirects.tf's ravendarque.com/logbook redirect (phase =
# "http_request_dynamic_redirect", function-call expression syntax).
resource "cloudflare_dns_record" "app_www" {
  zone_id = data.cloudflare_zone.app.id
  name    = "www.${var.app_zone_name}"
  type    = "CNAME"
  content = var.app_zone_name
  ttl     = 1
  proxied = true
  comment = "#527 -- www redirects to the apex, doesn't serve traffic itself."
}

resource "cloudflare_ruleset" "app_www_redirect" {
  zone_id     = data.cloudflare_zone.app.id
  kind        = "zone"
  phase       = "http_request_dynamic_redirect"
  name        = "www to apex redirect"
  description = "www.climbinglogbook.com -> climbinglogbook.com (#527)"

  rules = [
    {
      description = "Redirect www to the apex, preserving path"
      expression  = "(http.host eq \"www.${var.app_zone_name}\")"
      action      = "redirect"
      action_parameters = {
        from_value = {
          status_code = 301
          target_url = {
            expression = "concat(\"https://${var.app_zone_name}\", http.request.uri.path)"
          }
        }
      }
    }
  ]
}
