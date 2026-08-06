variable "cloudflare_account_id" {
  description = "Cloudflare account ID that owns this project's resources."
  type        = string
}

variable "zone_name" {
  description = "Zone the logbook is served from."
  type        = string
  default     = "ravendarque.com"
}

# #295 -- the dedicated domain the app is moving to. Kept as a separate
# variable rather than repointing `zone_name`, since both zones are live
# at once during the transition (ravendarque.com/logbook keeps working
# until its own removal-vs-redirect decision is made, separately).
variable "app_zone_name" {
  description = "Dedicated domain climbing-logbook is moving to (#295) -- apex for marketing/register/login, my.<this> for the app itself and #113's public per-user pages."
  type        = string
  default     = "climbinglogbook.com"
}

variable "kv_namespace_title" {
  description = "Title of the Workers KV namespace holding logbook entries."
  type        = string
  default     = "LOGBOOK_KV"
}

variable "d1_database_name" {
  description = "Name of the D1 database backing Better Auth and (eventually, #21) multi-tenant logbook data."
  type        = string
  default     = "climbing-logbook"
}
