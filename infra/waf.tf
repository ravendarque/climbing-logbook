# #529 -- Cloudflare's own audit (#380) flagged no WAF Custom Rules and
# no rate limiting on auth endpoints.
#
# Only the unambiguous half of #529 is here -- blocking non-JSON POSTs
# to the API. The auth-endpoint brute-force mitigation (the other half
# of #529) is deliberately NOT included: a plain WAF custom rule has no
# request-counting mechanism (that's what Rate Limiting Rules exist for,
# separately, and Free allows only 1 -- already used for the leaked-
# credential check), so a "challenge" action here would apply to every
# single request unconditionally, not just excessive/abusive ones --
# that means challenging every legitimate login too (sign-up already has
# its own Turnstile widget, infra/turnstile.tf; sign-in has no bot
# defense at all today, so this would be new, permanent friction on
# every login, not brute-force-specific mitigation). Left for a decision
# on #529 before implementing further -- see that issue.
#
# The Free Managed Ruleset (OWASP-based signature rules) is a separate,
# dashboard-only toggle -- this provider version has no resource for
# enabling account-provided managed rulesets on a zone (confirmed against
# the installed `cloudflare/cloudflare ~> 5.0` schema: no
# `cloudflare_managed_ruleset`-shaped resource exists). See infra/
# README.md for that one-time manual step.

resource "cloudflare_ruleset" "app_waf_custom_rules" {
  zone_id     = data.cloudflare_zone.app.id
  kind        = "zone"
  phase       = "http_request_firewall_custom"
  name        = "climbing-logbook WAF custom rules"
  description = "Block non-JSON API POSTs (#529)"

  rules = [
    {
      # text/csv is real, legitimate traffic here -- client/account-
      # import-main.js's bulk CSV import (#224) posts `Content-Type:
      # text/csv` to /logbook/api/admin/logbook/import, not JSON.
      # Confirmed by reading that file before writing this rule, not
      # assumed from the audit's own generic "non-JSON, non-multipart"
      # guess (which named multipart -- this app doesn't actually use
      # multipart anywhere against /logbook/api/).
      description = "Block unexpected content types to the API"
      expression  = "(starts_with(http.request.uri.path, \"/logbook/api/\")) and (http.request.method eq \"POST\") and (not any(http.request.headers[\"content-type\"][*] contains \"application/json\")) and (not any(http.request.headers[\"content-type\"][*] contains \"text/csv\"))"
      action      = "block"
    }
  ]
}
