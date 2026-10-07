output "d1_database_id" {
  description = "Read by infra.yml to keep wrangler.jsonc's d1_databases id in sync."
  value       = cloudflare_d1_database.logbook.id
}

output "turnstile_sitekey" {
  description = "Written into client/turnstile.js by infra.yml. Not secret: sitekeys are embedded in client-side JavaScript."
  value       = cloudflare_turnstile_widget.register.id
}

# #934 -- beta explicitly called out below after a real, confirmed
# incident (2026-09-23): #932 added beta.<zone> to this widget's own
# `domains` list, switching beta's client-side code to send it real
# tokens for the first time -- but this secret had never actually been
# set for env.beta (Raven's own confirmation), so every real submission
# on beta failed server-side verification ("Bot verification failed")
# despite the widget itself succeeding client-side. Nothing here
# previously said beta needed this step at all.
output "turnstile_secret" {
  description = "The Turnstile widget's server-side verification secret -- read manually (terraform output -raw turnstile_secret), piped straight into `wrangler secret put TURNSTILE_SECRET_KEY --env=production` AND `--env=beta` (both consume this same widget, both need the real secret set independently -- Workers secrets are per-environment, setting one never sets the other), never displayed. Not synced automatically by infra.yml, unlike the sitekey above."
  value       = cloudflare_turnstile_widget.register.secret
  sensitive   = true
}

output "admin_access_aud" {
  description = "The admin Access application's audience tag. infra.yml writes it into wrangler.jsonc as ACCESS_AUD, which the Worker checks every admin request's token against."
  value       = cloudflare_zero_trust_access_application.admin.aud
}
