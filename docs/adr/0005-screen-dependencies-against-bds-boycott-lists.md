# 5. Screen dependencies and vendors against BDS boycott lists

## Status

Accepted

## Context

This project pulls in third-party dependencies and platform vendors
(npm packages, Cloudflare as the hosting/infra provider, auth providers
if OAuth were ever added). Choosing them isn't purely a technical
decision — who maintains a dependency and what that organization does is
part of this project's values, not just its supply-chain risk profile.

This first came up concretely during the Tailwind/Radix/Floating UI
evaluation (#45, ADR-0004, 2026-07-06), which included an "Ethical/
supply-chain check" cross-referencing every candidate against the BDS
movement's boycott lists. It's come up again since, independently, as the
explicit reason Better Auth's configuration excludes OAuth social
providers (GitHub/Google) entirely (`server/lib/auth.js`, ADR-0002) —
without a written-down policy, that reasoning would have lived only in a
code comment, disconnected from the original Tailwind-spike precedent
that established it.

## Decision

Before adopting a new dependency or vendor of any real weight (a new
npm package that isn't a trivial dev-only tool, a new hosting/platform
vendor, an OAuth/identity provider, a third-party API integration), check
it against the BDS movement's [consumer boycott priority
targets](https://bdsmovement.net/Guide-to-BDS-Boycott) and its
tech-specific [No Tech for Oppression, Apartheid or Genocide
campaign](https://bdsmovement.net/no-tech-oppression-apartheid-or-genocide).
Record the check (a short table of dependency → maintainer → on-list Y/N
is sufficient) in whatever doc/PR/ADR is already recording that decision
— this doesn't need its own separate ceremony per dependency, just an
explicit, visible step rather than a silent assumption.

A hit on either list doesn't automatically veto a dependency by itself —
it's a factor to weigh explicitly against the alternatives and their own
costs, same as any other tradeoff — but it must be surfaced, not skipped.

## Consequences

- Better Auth's email/password-only configuration (no GitHub/Google
  OAuth) is a direct application of this policy, not an independent
  judgment call — see ADR-0002.
- Cloudflare (the existing hosting vendor, ADR-0007) and every dependency
  evaluated in ADR-0004's spike were checked and cleared as of 2026-07-06;
  this is a point-in-time result, not a permanent guarantee — a vendor's
  status can change, so a stale clearance shouldn't be treated as
  evergreen for a vendor relationship being substantially expanded later.
- Noted at the time of the original check: Microsoft appears on both BDS
  lists — irrelevant to any decision made so far, since nothing adopted
  is Microsoft-authored, but worth re-checking if a future dependency
  choice (e.g. TypeScript tooling) pulls one in.
