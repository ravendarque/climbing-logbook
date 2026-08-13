# Architecture Decision Records

Records of significant architecture decisions made in this project, and the
reasoning behind them — so a future reader can see *why*, not just *what*,
without doing git archaeology through old PRs and issue threads.

## Format

Plain Markdown, [Michael Nygard's format](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions):
Title, Status, Context, Decision, Consequences. No tooling or dependency
(no `adr-tools`, no log4brains) — git-tracked files that render natively on
GitHub, the same treatment every other doc in this repo already gets.

## Rules

- **Numbered sequentially**, `NNNN-title.md`, never reused.
- **Never edited after acceptance** — if a decision changes, write a new
  ADR and have it supersede the old one by reference (link both ways).
  The old ADR's "Status" becomes "Superseded by ADR-000X"; its content
  stays as a historical record of what was believed true at the time. A
  pure transcription fix (removing content that duplicates a living doc
  elsewhere, with the underlying decision itself unchanged) is a narrow
  exception to this, not a loophole for touching up reasoning or
  conclusions after the fact — see ADR-0006's own edit for a real example
  (found and corrected during #359).
- **Don't duplicate an actively-maintained checklist inside a Decision
  section** (e.g. `docs/coding-standards.md`'s Part 2, an intentionally
  living document) — link to it instead. A copy frozen inside an ADR
  drifts silently out of sync the moment the real checklist changes,
  since the ADR itself can't be updated to match.
- **Write one when a decision is genuinely hard to reverse, or when the
  reasoning isn't obvious from reading the resulting code** — not for
  every change. Routine feature work doesn't need one.
- **Capture the decision when it's made, not when it ships** — implementation
  can lag behind the ADR (see ADR-0015, written before its own #363).

## Index

| ADR | Title | Status |
|---|---|---|
| [0001](0001-record-architecture-decisions.md) | Record architecture decisions with ADRs | Accepted |
| [0002](0002-replace-cloudflare-access-with-better-auth.md) | Replace Cloudflare Access with Better Auth | Accepted |
| [0003](0003-web-components-for-shared-ui-and-route-split.md) | Native Web Components for shared UI + multi-page route split | Accepted |
| [0004](0004-tailwind-for-styling-reject-radix.md) | Adopt Tailwind for styling, reject Radix, add Floating UI | Accepted |
| [0005](0005-screen-dependencies-against-bds-boycott-lists.md) | Screen dependencies and vendors against BDS boycott lists | Accepted |
| [0006](0006-design-for-poor-connectivity-first.md) | Design for poor connectivity as a first-class constraint | Accepted |
| [0007](0007-single-cloudflare-worker-not-separate-pages-project.md) | A single Cloudflare Worker, not a separate Pages project per surface | Accepted |
| [0008](0008-tag-based-semantic-versioning.md) | Tag-based semantic versioning, not package.json commits | Accepted |
| [0009](0009-normalized-d1-schema-with-lookup-tables.md) | Normalized D1 schema with real lookup tables | Accepted |
| [0010](0010-public-url-structure-my-domain-username.md) | Public URL structure: my.&lt;domain&gt;/username | Accepted |
| [0011](0011-three-layer-test-pyramid.md) | Three-layer test pyramid: real Workers runtime, extracted-logic unit tests, Playwright E2E | Accepted |
| [0012](0012-client-modularization-factories-no-framework.md) | Client-side modularization: esbuild + ES modules + factories, no framework | Accepted |
| [0013](0013-pr-previews-via-wrangler-versions-upload.md) | PR preview deployments via wrangler versions upload | Accepted |
| [0014](0014-closed-beta-invite-gate-togglable-not-removable.md) | Closed-beta invite gate, togglable off rather than removed | Accepted, partially superseded by 0016 |
| [0015](0015-web-analytics-eu-exclusion-not-consent-banner.md) | Cloudflare Web Analytics with EU exclusion, not a cookie consent banner | Accepted |
| [0016](0016-beta-gate-request-level-wrapper-not-hook.md) | Beta invite claim/release runs as a request-level wrapper, not a Better Auth hook | Accepted |
