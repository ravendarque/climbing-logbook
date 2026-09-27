# Form-level bot defense on /register (#311) -- complements #300's
# domain-level bot/AI-crawler restrictions with a check on the signup
# endpoint specifically. "managed" mode adapts between invisible and an
# interactive challenge based on Cloudflare's own risk signals, rather
# than always showing a challenge (non-interactive) or never (invisible).
resource "cloudflare_turnstile_widget" "register" {
  account_id = var.cloudflare_account_id
  name       = "climbing-logbook-register"
  # Must match client/turnstile.js's REAL_SITEKEY_HOSTNAMES. Sorted: Cloudflare returns it sorted, so any other order plans as a change.
  domains = sort([var.app_zone_name, "beta.${var.app_zone_name}"])
  mode    = "managed"

  # #1075 -- a replaced widget gets a new sitekey and secret. The sitekey
  # syncs through infra.yml, but the secret is set by hand with `wrangler
  # secret put` per environment (outputs.tf), so a replacement would break
  # sign-up and the report/feedback forms on both hosts until someone
  # noticed.
  lifecycle {
    prevent_destroy = true
  }
}
