# Form-level bot defense on /register (#311) -- complements #300's
# domain-level bot/AI-crawler restrictions with a check on the signup
# endpoint specifically. "managed" mode adapts between invisible and an
# interactive challenge based on Cloudflare's own risk signals, rather
# than always showing a challenge (non-interactive) or never (invisible).
resource "cloudflare_turnstile_widget" "register" {
  account_id = var.cloudflare_account_id
  name       = "climbing-logbook-register"
  # #295 -- /register moved to the apex of the new domain, so this now
  # points at var.app_zone_name (climbinglogbook.com), not var.zone_name
  # (ravendarque.com, where the form no longer lives at all).
  domains = [var.app_zone_name]
  mode    = "managed"
}
