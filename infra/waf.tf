# Sign-in brute force is handled by the Workers Rate Limiting binding (#1049), not a WAF rule: a challenge rule can't count requests.

# Cloudflare Managed Free Ruleset (OWASP-based signatures), deployed by an execute rule in the managed phase (#529).
resource "cloudflare_ruleset" "app_waf_managed" {
  zone_id     = data.cloudflare_zone.app.id
  kind        = "zone"
  phase       = "http_request_firewall_managed"
  name        = "climbing-logbook WAF managed rules"
  description = "Run the Cloudflare Managed Free Ruleset (#529)"

  rules = [{
    ref         = "execute_cloudflare_managed_free_ruleset"
    description = "Execute the Cloudflare Managed Free Ruleset"
    expression  = "true"
    action      = "execute"
    enabled     = true
    action_parameters = {
      id = "77454fe2d30c4220b5701f6fdfb893ba"
    }
  }]
}

resource "cloudflare_ruleset" "app_waf_custom_rules" {
  zone_id     = data.cloudflare_zone.app.id
  kind        = "zone"
  phase       = "http_request_firewall_custom"
  name        = "climbing-logbook WAF custom rules"
  description = "Block non-JSON API POSTs (#529)"

  rules = [
    {
      # The bulk import posts text/csv (#224); nothing here uses multipart.
      description = "Block unexpected content types to the API"
      expression  = "starts_with(http.request.uri.path, \"/-/api/\") and (http.request.method eq \"POST\") and (not any(http.request.headers[\"content-type\"][*] contains \"application/json\")) and (not any(http.request.headers[\"content-type\"][*] contains \"text/csv\"))"
      action      = "block"
    }
  ]
}
