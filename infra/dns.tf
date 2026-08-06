# #295 -- placeholder DNS for the new domain. Cloudflare Workers Routes
# (wrangler.jsonc's `routes`, not a Terraform resource -- see
# docs/infra-architecture.md's "Why a Worker, not another Pages project")
# only ever intercept traffic that already reaches Cloudflare's edge for a
# given hostname; a zone with zero DNS records at all doesn't resolve, so
# there's nothing for a Route to intercept. These are dummy, unreachable
# proxied records purely to make the hostnames resolve through Cloudflare
# -- 192.0.2.1 is RFC 5737's TEST-NET-1, standard practice for a "this IP
# is never actually contacted" placeholder, since the Worker Route answers
# every request before Cloudflare would ever reach out to `content`.
data "cloudflare_zone" "app" {
  filter = {
    name = var.app_zone_name
  }
}

resource "cloudflare_dns_record" "app_apex" {
  zone_id = data.cloudflare_zone.app.id
  name    = var.app_zone_name
  type    = "A"
  content = "192.0.2.1"
  ttl     = 1
  proxied = true
  comment = "Placeholder for the climbing-logbook Worker Route (#295) -- traffic never actually reaches this IP."
}

resource "cloudflare_dns_record" "app_my_subdomain" {
  zone_id = data.cloudflare_zone.app.id
  name    = "my.${var.app_zone_name}"
  type    = "A"
  content = "192.0.2.1"
  ttl     = 1
  proxied = true
  comment = "Placeholder for the climbing-logbook Worker Route (#295) -- traffic never actually reaches this IP."
}
