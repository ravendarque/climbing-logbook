resource "cloudflare_d1_database" "logbook" {
  account_id = var.cloudflare_account_id
  name       = var.d1_database_name

  # Explicit, not left to the provider's own default -- the cloudflare
  # provider (5.21.1) rejects an apply that omits this block entirely
  # with "Invalid property: read_replication => Expected object, received
  # null" on any *update* to this resource (worked fine on the original
  # create, only surfaced once a later apply needed to modify anything
  # else about this resource -- caught 2026-08-06 while provisioning
  # #311's Turnstile widget, unrelated to Turnstile itself). "auto" lets
  # D1 place read replicas automatically -- Cloudflare's own recommended
  # default, not a deliberate choice to disable replication.
  read_replication = {
    mode = "auto"
  }
}
