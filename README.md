# Climbing Logbook

A climbing logbook: log, edit and browse your climbs, works offline, and
installs as a PWA. The site is at
[climbinglogbook.com](https://climbinglogbook.com); each user's app and
public profile live at `my.climbinglogbook.com/<username>` (ADR-0010), with
an opt-in beta at `beta.climbinglogbook.com` (ADR-0020).

## Stack

One Cloudflare Worker (Static Assets plus the API, ADR-0007), D1 for
storage, Better Auth for authentication, Terraform for infrastructure,
GitHub Actions for CI/CD. No UI framework: native Web Components and ES
modules (ADR-0003, ADR-0012), bundled by Vite (ADR-0021), page shells
templated by 11ty (ADR-0022), styled with Tailwind (ADR-0004). A service
worker makes the owner app open offline (ADR-0028).

## Local development

```
pnpm install
pnpm dev
```

Runs `vite dev` (through `@cloudflare/vite-plugin`), the Tailwind watcher
and the 11ty watcher together, at `http://localhost:5173`. Owner pages
need the `my.` host: `http://my.localhost:5173/<username>/log`. Plain
`wrangler dev` doesn't work here: it can't serve a `my.` host and rewrites
the request origin, which breaks Better Auth.

See `docs/app-architecture.md` for local auth setup — the `/-/api/`
resource routes require a real Better Auth session, same as production.

## Deploying

Merging to `main` doesn't deploy anything. A `vX.Y.Z` tag does: see
`docs/versioning.md` for what counts as a release and how to cut one.
Infra changes (`infra/**`) apply through their own workflow on merge; see
`infra/README.md` and `docs/infra-architecture.md` before touching them.

## Documentation

- [`docs/coding-standards.md`](docs/coding-standards.md) — the review
  framework and project-specific standards this codebase (and its automated
  PR review) is held to
- [`docs/app-architecture.md`](docs/app-architecture.md) — request routing,
  data model, auth flow, offline design
- [`docs/infra-architecture.md`](docs/infra-architecture.md) — Cloudflare
  Worker/routing setup, Terraform-managed resources, CI workflows, disaster
  recovery
- [`docs/climbing-analytics-research.md`](docs/climbing-analytics-research.md) —
  sourced research grounding a future reporting/insights feature (grade
  pyramid methodology, schema recommendations)
- [`docs/versioning.md`](docs/versioning.md) — what counts as a version
  bump, and how to cut a release
- [`infra/README.md`](infra/README.md) — one-time setup steps for
  provisioning this project's infrastructure from scratch
