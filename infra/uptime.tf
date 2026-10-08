# External uptime checks and the public status page (#1048). Better Stack's probe is a Cloudflare verified bot.
locals {
  uptime_check_seconds = 180
}

resource "betteruptime_monitor" "home" {
  url                = "https://${var.app_zone_name}/"
  pronounceable_name = "Climbing Logbook home page"
  monitor_type       = "keyword"
  required_keyword   = "Climbing Logbook"
  check_frequency    = local.uptime_check_seconds
  regions            = ["eu", "us"]
  ssl_expiration     = 14
  domain_expiration  = 30
  email              = true
  push               = true
}

resource "betteruptime_monitor" "app_ready" {
  url                = "https://my.${var.app_zone_name}/-/api/health/ready"
  pronounceable_name = "Climbing Logbook app"
  monitor_type       = "keyword"
  required_keyword   = "\"ok\":true"
  check_frequency    = local.uptime_check_seconds
  regions            = ["eu", "us"]
  email              = true
  push               = true
}

resource "betteruptime_monitor" "beta_ready" {
  url                = "https://beta.${var.app_zone_name}/-/api/health/ready"
  pronounceable_name = "Climbing Logbook beta"
  monitor_type       = "keyword"
  required_keyword   = "\"ok\":true"
  check_frequency    = local.uptime_check_seconds
  regions            = ["eu", "us"]
  email              = true
  push               = false
}

resource "betteruptime_outgoing_webhook" "discord_alerts" {
  name                               = "Discord #alerts"
  url                                = var.discord_alerts_webhook
  trigger_type                       = "incident_change"
  on_incident_started                = true
  on_incident_resolved               = true
  on_incident_reopened               = true
  notify_alongside_primary_responder = true
  custom_webhook_template_attributes {
    http_method   = "post"
    body_template = jsonencode({ content = "**$STATUS**: $NAME\n$CAUSE\n$INCIDENT_URL" })
  }
}

resource "betteruptime_status_page" "public" {
  company_name  = "Climbing Logbook"
  company_url   = "https://${var.app_zone_name}"
  subdomain     = "climbinglogbook"
  custom_domain = "status.${var.app_zone_name}"
  timezone      = "London"
  design        = "v2"
  layout        = "vertical"
  subscribable  = false
}

resource "betteruptime_status_page_resource" "website" {
  status_page_id = betteruptime_status_page.public.id
  resource_id    = betteruptime_monitor.home.id
  resource_type  = "Monitor"
  public_name    = "Website"
}

resource "betteruptime_status_page_resource" "app" {
  status_page_id = betteruptime_status_page.public.id
  resource_id    = betteruptime_monitor.app_ready.id
  resource_type  = "Monitor"
  public_name    = "App and sync"
}

resource "cloudflare_dns_record" "status_page" {
  zone_id = data.cloudflare_zone.app.id
  name    = "status.${var.app_zone_name}"
  type    = "CNAME"
  content = "statuspage.betteruptime.com"
  ttl     = 1
  proxied = false
  comment = "Better Stack status page (#1048)."
}
