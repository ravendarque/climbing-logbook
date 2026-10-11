# Bot Fight Mode, its JavaScript detections, and AI crawler blocking with a managed robots.txt (#300, #1336).
# The Terms of use promise AI crawlers are blocked; ai_training/ai_search/ai_user aren't in the provider yet (infra/README.md).
import {
  to = cloudflare_bot_management.app
  id = data.cloudflare_zone.app.id
}

resource "cloudflare_bot_management" "app" {
  zone_id                 = data.cloudflare_zone.app.id
  fight_mode              = true
  enable_js               = true
  ai_bots_protection      = "block"
  crawler_protection      = "enabled"
  content_bots_protection = "disabled"
  is_robots_txt_managed   = true
  cf_robots_variant       = "off"
}
