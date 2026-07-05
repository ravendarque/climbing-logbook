output "kv_namespace_id" {
  description = "Read by infra.yml to keep wrangler.jsonc's kv_namespaces id in sync."
  value       = cloudflare_workers_kv_namespace.logbook.id
}

output "access_application_id" {
  value = cloudflare_zero_trust_access_application.logbook_admin.id
}
