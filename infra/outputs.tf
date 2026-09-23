output "d1_database_id" {
  description = "Read by infra.yml to keep wrangler.jsonc's d1_databases id in sync."
  value       = cloudflare_d1_database.logbook.id
}

output "turnstile_sitekey" {
  description = "Read by infra.yml to keep static/register/register.js's and client/report-issue-main.js's own REAL_SITEKEY constants in sync (#924/#932 -- both consume this same widget). Not secret -- sitekeys are meant to be embedded in public HTML/client-side JS."
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
