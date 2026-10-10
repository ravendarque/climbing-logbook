# 36. PR previews via Cloudflare Previews

## Status

Accepted (#1338, 2026-10-11). Supersedes [ADR-0013](0013-pr-previews-via-wrangler-versions-upload.md).

## Context

ADR-0013 made each PR's preview a Worker version uploaded with `wrangler versions upload --preview-alias pr-<n>` to the separate preview Worker. Cloudflare doesn't generate those preview URLs for a Worker that uses Durable Objects, and #1053's per-address email limit needs one. Cloudflare's newer [Previews](https://developers.cloudflare.com/workers/previews/) supports Durable Objects, giving each preview its own namespace.

The project prefers a platform's latest tooling unless there's a specific reason not to.

## Decision

- Each PR gets a Preview of the preview Worker (`climbing-logbook-preview`), made with `wrangler preview --name pr-<n>`. `main`'s Preview is `--name main`.
- The preview Wrangler environment's `previews` block repeats what the app needs (variables, rate limits, version metadata, the shared preview D1 database), since a Preview inherits none of the environment's settings.
- Previews share the preview D1 database, as before. Migrations are still applied to it before a Preview deploys.
- A PR's Preview is deleted when the PR closes. The free plan keeps 100 Previews per Worker and deletes the least recently deployed beyond that.

## Consequences

- Preview URLs keep their form: `pr-<n>-climbing-logbook-preview.<subdomain>.workers.dev`.
- Durable Objects work in previews, each Preview with its own storage.
- A new binding has to be added to the `previews` block as well as the environment, or previews won't have it.
- `wrangler preview --json` names the token's owner, so CI prints only the URL.
