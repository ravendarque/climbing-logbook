# Cloudflare alerts to Discord (#1052). The Worker errors alert uses discord_alerts but is made through the API: see docs/infra-architecture.md.
resource "cloudflare_notification_policy_webhooks" "discord_alerts" {
  account_id = var.cloudflare_account_id
  name       = "Discord #alerts"
  url        = var.discord_alerts_webhook
}

resource "cloudflare_notification_policy_webhooks" "discord_monitoring" {
  account_id = var.cloudflare_account_id
  name       = "Discord #monitoring"
  url        = var.discord_monitoring_webhook
}

resource "cloudflare_notification_policy" "ddos" {
  account_id = var.cloudflare_account_id
  name       = "HTTP DDoS attack"
  alert_type = "dos_attack_l7"
  enabled    = true
  mechanisms = { webhooks = [{ id = cloudflare_notification_policy_webhooks.discord_monitoring.id }] }
}

resource "cloudflare_notification_policy" "certificates" {
  account_id = var.cloudflare_account_id
  name       = "Certificates"
  alert_type = "universal_ssl_event_type"
  enabled    = true
  mechanisms = { webhooks = [{ id = cloudflare_notification_policy_webhooks.discord_monitoring.id }] }
}
