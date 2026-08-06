# 10. Public URL structure: my.&lt;domain&gt;/username

## Status

Accepted

## Context

Deciding whether `climbing-logbook` should keep serving from `/logbook`
on the shared `ravendarque.com` domain, or move to a dedicated domain,
surfaced a deeper problem (#113): the URL structure isn't purely a
deployment/routing concern that can be changed later for free. Cloudflare
Workers Routes don't rewrite paths, so whatever structure gets chosen has
to be baked into the app's own code (asset paths, API route matching)
regardless of when it's decided — worth deciding once, deliberately,
alongside the rest of #8's multi-tenant design, not as a side effect of a
domain move made for other reasons.

## Options considered

1. `climbinglogbook.com/logbook/@username` — keep a fixed `/logbook`
   namespace prefix, username as a sub-path.
2. `climbinglogbook.com/@username` — Instagram-style, with a literal `@`
   in the URL.
3. `climbinglogbook.com/username` — bare username at root; needs a
   reserved-word blocklist enforced at signup (`register`, `login`,
   `api`, etc. would otherwise collide with real routes).
4. `my.climbinglogbook.com/username` — reads well ("my climbing
   logbook..."), no reserved-word blocklist needed since it's on its own
   subdomain (nothing else is ever routed there), shorter/more memorable
   than option 1, no unusual character like option 2.

## Decision

**Option 4: `my.climbinglogbook.com/username`.**

The apex (`climbinglogbook.com`) hosts the marketing page plus `/register`
and `/login`. `my.climbinglogbook.com` hosts the actual app, with
`/:username` as the public per-user page — the same URL a logged-in owner
sees their own full-featured view at (see ADR-0003 for how capability at
that one URL is resolved by session match, not by routing to a different
page). Successful login redirects to `my.climbinglogbook.com/<username>`.

Public visibility is gated by `settings.logbook_public` (ADR-0009,
default public) — a private user's page shows a "this logbook is
private" message rather than the data.

## Consequences

- No reserved-word blocklist needed for usernames — the subdomain split
  means a username can never collide with a real app route, since nothing
  else is ever served from `my.climbinglogbook.com`.
- Committed the app to a subdomain-per-concern DNS/routing shape ahead of
  #295's actual domain cutover — `my.climbinglogbook.com` needed its own
  DNS record and Worker Route before it could resolve at all (see
  ADR-0007 for the single-Worker, multi-hostname dispatch this enabled).
- This decision is why the login redirect bug (which surfaced #113's
  original implementation as architecturally wrong — see ADR-0003's
  Context) was diagnosable as a bug at all: the *shape* of the URL
  (`my.<domain>/username`) was correct and never changed; only *what*
  got served at that shape (a separate static page vs. the real app with
  session-aware capability) was wrong.
