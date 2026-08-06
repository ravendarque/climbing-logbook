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
  stays as a historical record of what was believed true at the time.
- **Write one when a decision is genuinely hard to reverse, or when the
  reasoning isn't obvious from reading the resulting code** — not for
  every change. Routine feature work doesn't need one.

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
