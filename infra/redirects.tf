# #295 -- ravendarque.com/logbook is retired in favor of the new domain.
# A zone-level redirect ruleset, not a route inside this Worker's own
# fetch() -- Cloudflare Static Assets matches by path only (confirmed
# during #113/#335), so a Worker-level redirect can never win against the
# real static app files still sitting at public/logbook/ (they're also
# what serves my.climbinglogbook.com/logbook -- the same files, on
# purpose). A redirect ruleset runs at the edge, ahead of both Workers
# Routes and Static Assets, so it intercepts cleanly regardless. The
# existing `ravendarque.com/logbook*` Workers Route in wrangler.jsonc is
# left in place, now unreachable for real traffic -- harmless dead
# config, not worth a separate cleanup PR just for this.
data "cloudflare_zone" "ravendarque" {
  filter = {
    name = var.zone_name
  }
}

resource "cloudflare_ruleset" "ravendarque_logbook_redirect" {
  zone_id = data.cloudflare_zone.ravendarque.id
  kind    = "zone"
  # "http_request_redirect" (the docs-summarized value first tried here)
  # is Bulk Redirects' phase, account-scoped only -- confirmed live, not
  # assumed, after a real apply 400'd with 'phase "http_request_redirect"
  # not allowed at zone level'. "http_request_dynamic_redirect" is Single/
  # Dynamic Redirects' actual phase, the zone-level feature this needs --
  # matches the "Rules & Configuration: Dynamic URL Redirects" token
  # permission this resource actually needed (see docs/infra-
  # architecture.md's permission table).
  phase = "http_request_dynamic_redirect"
  name  = "climbing-logbook apex retirement redirect"
  description = "ravendarque.com/logbook* -> my.climbinglogbook.com/ravendarque (#295)"

  rules = [
    {
      description = "Redirect the retired /logbook app to the new domain"
      expression  = "http.request.uri.path starts_with \"/logbook\""
      action      = "redirect"
      action_parameters = {
        from_value = {
          status_code = 301
          target_url = {
            value = "https://my.climbinglogbook.com/ravendarque"
          }
        }
      }
    }
  ]
}
