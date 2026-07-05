resource "cloudflare_workers_kv_namespace" "logbook" {
  account_id = var.cloudflare_account_id
  title      = var.kv_namespace_title
}

# This namespace already existed before Terraform managed anything here
# (created in an earlier session, via scripts/provision.mjs) — import
# it instead of trying to create a duplicate with the same title.
import {
  to = cloudflare_workers_kv_namespace.logbook
  id = "${var.cloudflare_account_id}/47bd45146334450f82ca7dcb69c34b15"
}
