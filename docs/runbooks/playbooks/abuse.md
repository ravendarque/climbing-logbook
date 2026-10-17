# Abuse or credential stuffing

**Detect:** a spike in sign-in failures or rate-limit hits in Workers Observability, many sign-ups, reports in #support, WAF events in the Cloudflare dashboard (Security → Events).

**Diagnose:** Security → Events shows blocked and challenged requests by rule and country; Workers Observability shows rate-limit rejections by surface.

**Mitigate:**
- Sign-ups: the invite gate (`BETA_GATE_ENABLED`) is on, so only invited people can sign up.
- Sign-in: per-IP and per-account limits (ADR-0027, #1049) slow stuffing; the WAF's managed free ruleset (#529) blocks known exploit patterns.
- A specific bad actor: suspend or ban the account from the admin host (Users), which records it in the audit log.
- Under Attack Mode (Security → Settings) challenges every visitor, which can interrupt the app's background requests; use it only as a last resort and post on the status page.
