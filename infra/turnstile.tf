# Form-level bot defense on /register (#311) -- complements #300's
# domain-level bot/AI-crawler restrictions with a check on the signup
# endpoint specifically. "managed" mode adapts between invisible and an
# interactive challenge based on Cloudflare's own risk signals, rather
# than always showing a challenge (non-interactive) or never (invisible).
resource "cloudflare_turnstile_widget" "register" {
  account_id = var.cloudflare_account_id
  name       = "climbing-logbook-register"
  # #295 -- /register moved to the apex of the new domain
  # (climbinglogbook.com), not ravendarque.com, where the form no longer
  # lives at all.
  # #932 -- beta.<zone> added: beta is meant to behave the same as
  # production (Raven's own call), and this widget also now backs
  # /help/report-an-issue/ (#924), reachable at both hostnames the same
  # way /register is. Client-side sitekey selection (static/register/
  # register.js, client/report-issue-main.js) has the matching allowlist
  # -- both sides have to agree, or a client picking the real sitekey on
  # a hostname Cloudflare doesn't recognize here would just get a real
  # siteverify rejection instead of a working widget.
  # #991 -- sorted, because Cloudflare returns the list sorted and the
  # provider types it as a list, not a set: any other order showed as an
  # in-place update (and a "changing" turnstile_secret output) in every
  # plan, masking real changes.
  domains = sort([var.app_zone_name, "beta.${var.app_zone_name}"])
  mode    = "managed"
}
