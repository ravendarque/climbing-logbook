# 13. PR preview deployments via `wrangler versions upload`, not native Workers Builds

## Status

Accepted

## Context

Every PR needed a real, working preview URL bound to its own isolated
data, never production (#222) — reviewing a change (especially anything
touching the client UI) against a live preview is far more reliable than
reading a diff alone. Cloudflare offers a native alternative:
dashboard-configured, Git-linked Workers Builds, which would deploy
automatically on push without any CI work in this repo.

## Decision

**Use this project's own CI** (`.github/workflows/preview.yml`) calling
**`wrangler versions upload --env preview`** — not `wrangler deploy`, and
not Cloudflare's native Git-linked Workers Builds.

Native Workers Builds was rejected because it would run as a second,
independent deploy path alongside this project's existing tag-triggered
pipeline (ADR-0008) — a dashboard-configured trigger this repo's own CI
has no visibility into or control over, duplicating logic (build steps,
environment setup) that already exists in `deploy.yml`.

`versions upload` (rather than `deploy`) uploads a new *version* of the
Worker without attaching a route or receiving production traffic — it
just produces a reachable preview URL. `--env preview` targets a
genuinely separate Worker script (Wrangler appends the environment name:
`climbing-logbook` → `climbing-logbook-preview`), with its own version
history, `routes: []`, and its own KV namespace/D1 database — never
production's. `workers_dev: true` is set only for this preview
environment (opposite of the top-level `workers_dev: false`, ADR-0007) —
there are no Access-gated (nor, since ADR-0002, session-gated-by-default)
production routes to bypass through it, since it never carries real
traffic regardless.

The preview KV namespace and D1 database are deliberately **not**
Terraform-managed, unlike their production counterparts — one-time manual
bootstraps, since per-PR preview data is disposable and doesn't need
disaster-recovery guarantees production data does.

## Consequences

- Every PR gets its own preview URL and its own isolated preview data,
  posted as a PR comment, updated in place across pushes to the same PR
  rather than accumulating comments.
- One real gap was found and fixed the hard way (2026-08-05): the preview
  environment had no `d1_databases` override for a long stretch, so it
  silently inherited the *production* database once one existed — `d1_
  databases` is inheritable-and-left-alone in `wrangler.jsonc`, not
  inheritable-and-overridden the way `vars`/`routes` are. Caught when a
  preview login had no credentials to work with (no preview database had
  ever been bootstrapped) before any real signup happened against it —
  but this was a close call, and the explicit override is now required
  reading for anyone adding a new environment-scoped binding.
- Closed/merged PRs' preview versions are never cleaned up — a known,
  accepted gap (no `closed` handler in `preview.yml`), not a bug.
- This preview mechanism is independent of Cloudflare's dashboard
  entirely — nothing about it depends on a Git-integration feature that
  could change or require reconfiguration outside this repo's own CI.
