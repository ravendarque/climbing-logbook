resource "cloudflare_workers_kv_namespace" "logbook" {
  account_id = var.cloudflare_account_id
  title      = var.kv_namespace_title
}
