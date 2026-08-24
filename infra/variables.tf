variable "cloudflare_account_id" {
  description = "Cloudflare account ID that owns this project's resources."
  type        = string
}

# #534 -- `zone_name` (ravendarque.com) used to back infra/redirects.tf's
# now-removed retirement redirect; ravendarque.com isn't otherwise in
# this repo's scope, so there's nothing left to parameterize it for.
variable "app_zone_name" {
  description = "Dedicated domain climbing-logbook is moving to (#295) -- apex for marketing/register/login, my.<this> for the app itself and #113's public per-user pages."
  type        = string
  default     = "climbinglogbook.com"
}

variable "d1_database_name" {
  description = "Name of the D1 database backing Better Auth and (eventually, #21) multi-tenant logbook data."
  type        = string
  default     = "climbing-logbook"
}
