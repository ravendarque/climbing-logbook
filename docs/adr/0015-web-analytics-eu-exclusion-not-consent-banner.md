# 15. Cloudflare Web Analytics with EU exclusion, not a cookie consent banner

## Status

Accepted

## Context

The app needed real-user-monitoring/traffic analytics (raised while
scoping #300's "data-protection copy" work, later split out to #190).
The first framing was "gate analytics behind a cookie consent banner" —
but that framing turned out to conflate two different legal questions.

Cloudflare Web Analytics is cookie-free and stores nothing on the
visitor's device, which satisfies the **ePrivacy Directive's cookie-consent
rule** (that rule is specifically about writing things to a user's
device). It does **not** by itself satisfy **GDPR's broader personal-data
rule** — the analytics beacon is still a network request from the
visitor's browser to Cloudflare carrying their IP address, page URL, and
referrer, and an IP address is commonly treated as personal data under
GDPR even when nothing is stored. "No cookies" and "no consent needed"
are not the same claim, and the first doesn't imply the second.

This app already sets exactly one cookie — Better Auth's session cookie,
which is a strictly-necessary cookie exempt from consent requirements
regardless of the analytics decision. So the actual open question was
narrower than "do we need a cookie banner": specifically, whether to
establish a legal basis (consent, or a documented legitimate-interest
justification) for processing EU visitors' analytics data, or avoid the
question by not processing it at all.

Cloudflare's dashboard surfaces exactly this choice directly: Web
Analytics has an "Install for all users except in the EU" toggle
(`cloudflare_web_analytics_site`'s `lite` attribute in Terraform) —
enabling it drops the beacon entirely for EU traffic, sidestepping the
GDPR question by processing no EU personal data at all, rather than
answering it.

## Decision

**Enable Cloudflare Web Analytics with `lite = true`** (excludes EU
visitors entirely) rather than building a consent-banner UI now. No new
UI, no consent-state persistence, no legal-basis documentation needed —
the analytics beacon simply never fires for EU traffic.

**Defer full EU-visitor coverage to a real consent mechanism, tracked
separately (#362)**, rather than either building that consent UI now (a
non-trivial feature: a banner, persisted consent state, and switching
from Cloudflare's edge-level `auto_install`/`lite` exclusion to a
manually-injected snippet the app itself gates on stored consent — `lite`
is an all-or-nothing edge setting with no per-visitor awareness) or
skipping the EU-inclusion goal entirely. Raven's stated end goal is full
population coverage eventually, so this is an explicit deferral of *how*,
not a decision to never do it.

## Consequences

- Zero analytics coverage for EU visitors until #362 ships — an accepted,
  bounded gap, not silently ignored.
- No consent-banner UI exists in the app today, and none is needed for
  the current cookie/analytics footprint (session cookie only, plus
  EU-excluded cookie-free analytics) — building one now would have solved
  a compliance requirement that doesn't currently exist.
- If a genuinely non-essential cookie-setting feature is ever added
  (a tracking pixel, a third-party embed), that's the actual trigger to
  revisit consent architecture generally — not Web Analytics, which stays
  cookie-free regardless of the `lite` setting.
- The privacy page (#190) needs to state this plainly: analytics excludes
  EU visitors for now, and describe the consent flow once #362 lands.
