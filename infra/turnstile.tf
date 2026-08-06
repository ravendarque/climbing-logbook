# Form-level bot defense on /register (#311) -- complements #300's
# domain-level bot/AI-crawler restrictions with a check on the signup
# endpoint specifically. "managed" mode adapts between invisible and an
# interactive challenge based on Cloudflare's own risk signals, rather
# than always showing a challenge (non-interactive) or never (invisible).
resource "cloudflare_turnstile_widget" "register" {
  account_id = var.cloudflare_account_id
  name       = "climbing-logbook-register"
  domains    = [var.zone_name]
  mode       = "managed"
}
