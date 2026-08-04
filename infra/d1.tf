resource "cloudflare_d1_database" "logbook" {
  account_id = var.cloudflare_account_id
  name       = var.d1_database_name
}
