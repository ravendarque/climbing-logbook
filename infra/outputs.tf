output "kv_namespace_id" {
  description = "Read by infra.yml to keep wrangler.jsonc's kv_namespaces id in sync."
  value       = cloudflare_workers_kv_namespace.logbook.id
}

output "d1_database_id" {
  description = "Read by infra.yml to keep wrangler.jsonc's d1_databases id in sync."
  value       = cloudflare_d1_database.logbook.id
}

output "turnstile_sitekey" {
  description = "Read by infra.yml to keep public/logbook/register/index.html's Turnstile widget in sync. Not secret -- sitekeys are meant to be embedded in public HTML."
  value       = cloudflare_turnstile_widget.register.id
}

output "turnstile_secret" {
  description = "The Turnstile widget's server-side verification secret -- read manually (terraform output -raw turnstile_secret), piped straight into `wrangler secret put TURNSTILE_SECRET_KEY`, never displayed. Not synced automatically by infra.yml, unlike the sitekey above."
  value       = cloudflare_turnstile_widget.register.secret
  sensitive   = true
}
