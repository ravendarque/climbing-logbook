# 7. A single Cloudflare Worker, not a separate Pages project per surface

## Status

Accepted

## Context

Cloudflare itself was inherited context, not a green-field evaluation —
this app originally lived at `ravendarque.com/logbook`, alongside
`my-limn` (the personal site it's linked from), already hosted on
Cloudflare. Cloudflare's status against this project's BDS-compliance
policy (ADR-0005) was checked and cleared at the time of the Tailwind
spike (ADR-0004).

Given Cloudflare as the platform, the real architectural question was how
much of it to use, and how to structure multiple logical surfaces on it.
Two concrete instances of this came up:

1. **The app itself (#20-era):** should climbing-logbook be a genuine
   Cloudflare Worker with its own zone route, or a thin proxy Function
   inside `my-limn` forwarding to a separate Cloudflare Pages project?
2. **Multi-hostname dispatch (#295):** once the app needed to serve both
   a marketing/auth apex (`climbinglogbook.com`) and the app itself
   (`my.climbinglogbook.com`), should that be one Worker handling both
   hostnames, or two separately deployed units?

## Decision

**One genuine Cloudflare Worker** (Workers Static Assets model — a
static frontend under `public/` plus a `fetch` handler for API routes)
owning its own [zone route](https://developers.cloudflare.com/workers/configuration/routing/routes/)
directly, rather than a thin proxy Function inside `my-limn`. This
requires zero code or awareness in `my-limn` — Cloudflare's route
matching is specificity-based, a Worker Route for a specific path
pattern wins over a Pages project's custom-domain claim on the same
hostname (confirmed live, not just assumed from docs, before being
treated as settled).

**The same single Worker serves both `climbinglogbook.com` and
`my.climbinglogbook.com`**, hostname-dispatched inside `server/index.js`'s
own `fetch()` handler, not two separately deployed units. The marketing
page and the app are the same product; splitting them into two
deployable units would mean two places for Better Auth's config/secret
to live and two things to keep in sync for no real benefit — unlike the
`my-limn`/climbing-logbook split above, which exists because those
*are* two genuinely independent products that happen to share a domain.

`workers_dev` is explicitly disabled at the top level (`workers_dev:
false`) so the default `*.workers.dev` preview URL isn't a second,
unlisted way to reach the same Worker's production routes.

## Consequences

- Zero coupling to `my-limn`'s own deploy cadence or codebase — a
  redeploy of either product never touches the other.
- One network hop, not two — no proxy Function relaying requests from
  `my-limn` into a separate Pages project.
- Multi-hostname dispatch is a single `if (hostname...)` branch inside
  one `fetch()` handler (see `server/index.js`), not a second Terraform
  stack, second secret set, or second deploy pipeline to keep in sync
  with the first.
- PR preview deployments (`preview.yml`, #222) use `wrangler versions
  upload --env preview` rather than Cloudflare's native Git-linked
  Workers Builds — a deliberate alternative that keeps preview
  deployments inside this project's own existing CI, at the cost of one
  extra environment block (`env.preview`) to keep in sync in
  `wrangler.jsonc`.
- If the marketing/apex surface ever needs to grow independently of the
  app's own release cadence (a genuinely separate content team, a
  different tech stack for the marketing page), the alternative
  considered and rejected here — a separate Pages project — remains a
  reasonable option to revisit, not a closed question.
