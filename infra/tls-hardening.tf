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

# #537 -- `full_strict` deliberately NOT managed here. First apply
# (2026-08-25) 400'd: `full_strict` requires a valid, unexpired TLS
# certificate actually installed at the origin (public CA or Cloudflare
# Origin CA) -- confirmed against Cloudflare's own docs. 192.0.2.1
# (dns.tf) is a non-routable placeholder with no server, let alone a
# cert, behind it -- every request is intercepted by the Worker Route
# before Cloudflare would ever reach origin, so there's nothing to
# validate against. Not just low-urgency, genuinely unsettable given
# this app's architecture -- same "N/A, no real origin" treatment the
# original audit already gave Authenticated Origin Pulls. Revisit only
# if this app ever gets a real origin server with its own TLS cert.

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

# #985 -- the apex's own pages. The app hosts (my./beta.) serve only the
# app: /-/*, /service-worker.js and /:username/* (#982). A request there
# for one of these 301s to the same path on the apex instead of serving a
# copy that looks like part of someone's profile. An allowlist, not
# "everything else", so the Worker never has to run for apex pages
# (static assets stay free and unlimited; see #985 for the trade-off).
# test/scripts/apex-redirect-rule.test.js fails if a top-level apex page
# is missing here. Their names are also reserved usernames (#997), so none
# can be a profile.
locals {
  app_hosts               = ["my.${var.app_zone_name}", "beta.${var.app_zone_name}"]
  apex_only_exact_paths   = ["/", "/help", "/login", "/register", "/reset-password", "/demo-picker.js"]
  apex_only_path_prefixes = ["/help/", "/login/", "/register/", "/reset-password/"]
}

# The zone's one ruleset for this phase (Cloudflare allows one entrypoint
# per phase), so every redirect rule lives here.
resource "cloudflare_ruleset" "app_www_redirect" {
  zone_id     = data.cloudflare_zone.app.id
  kind        = "zone"
  phase       = "http_request_dynamic_redirect"
  name        = "www to apex redirect"
  description = "www.climbinglogbook.com -> climbinglogbook.com (#527); apex pages off the app hosts (#985)"

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
    },
    {
      description = "Redirect apex-only pages on the app hosts to the apex, preserving path and query (#985)"
      expression  = "(http.host in {${join(" ", [for host in local.app_hosts : "\"${host}\""])}}) and (http.request.uri.path in {${join(" ", [for path in local.apex_only_exact_paths : "\"${path}\""])}} or ${join(" or ", [for prefix in local.apex_only_path_prefixes : "starts_with(http.request.uri.path, \"${prefix}\")"])})"
      action      = "redirect"
      action_parameters = {
        from_value = {
          status_code           = 301
          preserve_query_string = true
          target_url = {
            expression = "concat(\"https://${var.app_zone_name}\", http.request.uri.path)"
          }
        }
      }
    }
  ]
}
