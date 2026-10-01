resource "cloudflare_d1_database" "logbook" {
  account_id = var.cloudflare_account_id
  name       = var.d1_database_name

  # Off until reads go through the Sessions API (#1205). The provider rejects an update without this block.
  read_replication = {
    mode = "disabled"
  }

  # A deleted D1 database can't be restored, so any plan that would replace it must fail.
  lifecycle {
    prevent_destroy = true
  }
}
