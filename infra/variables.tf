variable "cloudflare_account_id" {
  description = "Cloudflare account ID that owns this project's resources."
  type        = string
}

variable "zone_name" {
  description = "Zone the logbook is served from."
  type        = string
  default     = "ravendarque.com"
}

variable "admin_email" {
  description = "Email address allowed to log in to the logbook's admin endpoints via Access one-time-PIN. Supplied out-of-band (tfvars/CI secret) — never committed."
  type        = string
  sensitive   = true
}

variable "kv_namespace_title" {
  description = "Title of the Workers KV namespace holding logbook entries."
  type        = string
  default     = "LOGBOOK_KV"
}
