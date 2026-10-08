variable "cloudflare_account_id" {
  description = "Cloudflare account ID that owns this project's resources."
  type        = string
}

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

variable "admin_email" {
  description = "The one email Access lets through to the admin host. Supplied by the ADMIN_EMAIL Actions secret, never committed."
  type        = string
  sensitive   = true
}

variable "support_forward_email" {
  description = "Where support@ mail is forwarded. Supplied by the TF_VAR_support_forward_email Actions secret, never committed."
  type        = string
  sensitive   = true
}

variable "betterstack_api_token" {
  description = "Better Stack Uptime team token. Supplied by the BETTERSTACK_API_TOKEN Actions secret, never committed."
  type        = string
  sensitive   = true
}

variable "discord_alerts_webhook" {
  description = "Discord #alerts webhook URL. Supplied by the DISCORD_ALERTS_WEBHOOK Actions secret, never committed."
  type        = string
  sensitive   = true
}

variable "discord_monitoring_webhook" {
  description = "Discord #monitoring webhook URL. Supplied by the DISCORD_MONITORING_WEBHOOK Actions secret, never committed."
  type        = string
  sensitive   = true
}
