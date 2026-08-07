# 1. Record architecture decisions with ADRs

## Status

Accepted

## Context

Architecture decisions in this repo have lived in two places: buried in
prose inside long-lived docs (`docs/app-architecture.md`,
`docs/infra-architecture.md`), which get rewritten out from under future
readers as the system evolves and the *why* quietly disappears along with
the text it was attached to; or scattered across PR descriptions and issue
threads, which are real records but not indexed or discoverable from the
code itself. There's no single place to see why a past decision was made
without git archaeology.

This surfaced concretely while working through epic #8 (turning a
single-user app into a multi-user service): the Cloudflare Access → Better
Auth swap and the native-Web-Components architecture pivot (#344) were both
significant, hard-to-reverse decisions reasoned through in conversation and
issue bodies, with no permanent home other than "read the whole issue
thread."

## Decision

Adopt lightweight Markdown ADRs, [Michael Nygard's
format](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions)
(Title, Status, Context, Decision, Consequences), stored at
`docs/adr/NNNN-title.md`, sequentially numbered starting from this one.

No new tooling or dependency — no `adr-tools` CLI, no log4brains. Plain
git-tracked markdown, rendered natively by GitHub, consistent with how
every other doc in this repo (`docs/coding-standards.md`,
`docs/versioning.md`, etc.) is already treated. This matches the project's
existing supply-chain-conscious stance (see `docs/ui-stack-evaluation.md`'s
"Ethical/supply-chain check" section) — no reason to pull in a dependency
for something a text file already does.

ADRs are never edited after acceptance. A changed decision gets a new ADR
that supersedes the old one by reference — the old ADR's Status line
becomes "Superseded by ADR-000X," and its content stays as an accurate
record of what was believed true at the time it was written.

Not every change needs one — routine feature work doesn't. Write one when
a decision is genuinely hard to reverse, or when the reasoning isn't
obvious from reading the resulting code.

## Consequences

- Future significant decisions get written down at decision time, not
  reconstructed from memory or git blame later.
- The existing architecture docs' inline "why" explanations aren't being
  ripped out to make room for this — that's a separate, deliberate
  follow-up (see the ADR backfill issue, #358, and its own follow-up #359)
  once the docs aren't mid-edit by other in-flight PRs.
- Thirteen ADRs are backfilled alongside this one, sourced from both the
  active discussion at the time (ADR-0002 through ADR-0007) and a sweep
  of every issue in the board's Done column looking for decisions that
  hadn't been written down anywhere permanent (ADR-0008 through ADR-0014):
  Access → Better Auth (0002), Web Components + route split (0003,
  #344), Tailwind/Radix/Floating UI (0004), BDS boycott-list screening
  (0005), poor-connectivity-first design (0006), single Cloudflare Worker
  not a separate Pages project (0007), tag-based versioning (0008),
  normalized D1 schema (0009), the `my.<domain>/username` URL structure
  (0010), the three-layer test pyramid (0011), client-side modularization
  (0012), PR previews via `wrangler versions upload` (0013), and the
  closed-beta invite gate (0014).
