# Climbing Logbook

A personal climbing logbook — browse, add, and edit sends/projects, works
offline, installable as a PWA. Served at
[ravendarque.com/logbook](https://ravendarque.com/logbook).

A standalone Cloudflare Worker, independently deployed from
[my-limn](https://github.com/ravendarque/my-limn) (the personal site it's
linked from) even though both share the `ravendarque.com` domain.

## Stack

Cloudflare Workers (Static Assets + a small API), Workers KV for storage,
Cloudflare Access for admin authentication, Terraform for infrastructure,
GitHub Actions for CI/CD. No framework, no build step — plain ES modules.

## Local development

```
pnpm install
pnpm dev
```

Serves at `http://localhost:8788`. The app lives at `/logbook/`.

No local secrets are needed — Cloudflare Access isn't simulated by
`wrangler dev`, so `/logbook/api/admin/*` is open locally by design (see
`docs/app-architecture.md`).

## Deploying

Pushing to `main` deploys automatically via GitHub Actions
(`.github/workflows/deploy.yml`). Infra changes (`infra/**`) apply via a
separate workflow — see `docs/infra-architecture.md` before touching
anything there, since ordering matters (state bucket → apply → deploy).

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
