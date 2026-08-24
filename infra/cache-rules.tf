# #528 -- Cloudflare's own audit (#380) flagged the zone cache level as
# `aggressive` with no explicit Cache Rules -- risks caching dynamic or
# authenticated responses if the Worker ever misses an explicit
# Cache-Control header. Cloudflare bypasses cache by default when
# Set-Cookie is present, but that's an implicit safety net, not a
# guarantee; these rules make it explicit and auditable.
#
# Attribute names (`edge_ttl.default`/`browser_ttl.default`, not
# `.value` -- the audit's own raw curl script got this wrong) verified
# against the installed provider (`cloudflare/cloudflare ~> 5.0`) schema
# before writing this.

resource "cloudflare_zone_setting" "app_cache_level" {
  zone_id    = data.cloudflare_zone.app.id
  setting_id = "cache_level"
  value      = "basic"
}

resource "cloudflare_ruleset" "app_cache_rules" {
  zone_id     = data.cloudflare_zone.app.id
  kind        = "zone"
  phase       = "http_request_cache_settings"
  name        = "climbing-logbook cache rules"
  description = "Bypass API/auth, cache static assets (#528)"

  rules = [
    {
      # /logbook/api/* is this app's one API prefix -- covers
      # /logbook/api/auth/* (sign-in/sign-up/session) too, not just
      # /logbook/api/logbook et al (server/index.js's own routing).
      # /login and /register (public/login/, public/register/) are
      # static, unpersonalized pages -- no server-side personalization
      # happens there, so they're left cacheable rather than bypassed
      # on the audit's generic (and, for this app, inaccurate) guess.
      description = "Bypass cache - API and auth endpoints"
      expression  = "starts_with(http.request.uri.path, \"/logbook/api/\")"
      action      = "set_cache_settings"
      action_parameters = {
        cache = false
      }
    },
    {
      description = "Cache static assets - 30d edge, 1y browser"
      expression  = "(http.request.uri.path.extension in {\"css\" \"js\" \"png\" \"jpg\" \"jpeg\" \"gif\" \"svg\" \"webp\" \"woff\" \"woff2\" \"ttf\" \"eot\" \"ico\" \"map\"})"
      action      = "set_cache_settings"
      action_parameters = {
        cache = true
        edge_ttl = {
          mode    = "override_origin"
          default = 2592000
        }
        browser_ttl = {
          mode    = "override_origin"
          default = 31536000
        }
      }
    }
  ]
}
