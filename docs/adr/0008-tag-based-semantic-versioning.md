# 8. Tag-based semantic versioning, not package.json commits

## Status

Accepted

## Context

Versioning was introduced after the fact, on an already-shipped project
(#179/#180). The question was where the version of record should live and
what triggers a deploy — a `package.json` `version` field bumped by a
commit is the conventional npm-ecosystem default, but this is a
continuously-deployed app, not a published library with consumers pinning
to a version range.

A separate, related bug (#197) surfaced during this work: a tag pushed
using the default `GITHUB_TOKEN` doesn't trigger other workflows (a
documented GitHub Actions restriction), which meant `deploy.yml` silently
never fired from `release.yml`'s own tag push.

## Decision

**A git tag `vX.Y.Z` is the single source of truth for the version** — not
a file. Nothing in the app or build reads a version from a file, so
there's nothing to keep in sync; `package.json`'s `version` field stays an
inert `"0.0.0"` placeholder, kept only because npm/pnpm require some
semver string to be present.

**Deploys are tag-gated, not merge-gated**: `deploy.yml` triggers on a
`vX.Y.Z` tag push, not on every merge to `main`. Merging integrates a
change; nothing goes live until a tag is deliberately cut.

**The release decision is a required PR label**, not inferred from commit
messages (no Conventional Commits convention is used, so mechanical
detection wasn't reliable) and not optional: one of `release: major/minor/
patch/none` is required before merge
(`.github/workflows/require-release-label.yml`), enforced as a required
status check. This exists specifically because #173 showed the
alternative fails in practice — three weeks of "no label → no release"
meant 58 PRs merged unlabeled by default, silently bundling real
user-facing changes into an unreleased backlog.

`release.yml` reads the label on merge, calculates the new version with
the `semver` package, and creates+pushes only the tag (no commit to
`main`, so this never interacts with branch protection). It authenticates
with a PAT rather than the default `GITHUB_TOKEN` specifically so the
resulting tag push can trigger `deploy.yml` (#197/#198).

See `docs/versioning.md` for the full SemVer interpretation this project
uses (what counts as MAJOR/MINOR/PATCH/no-bump for a single deployed app
rather than a versioned library API) and the version-history bootstrap.

## Consequences

- No file-based version to keep in sync across `package.json`, deploy
  scripts, or anywhere else — the tag is authoritative and there's
  exactly one place to look.
- The release decision is made once, deliberately, at review time by a
  human applying a label — not automated from commit text, and not
  skippable.
- `release: none` merges (docs, infra-only, refactors too small to flag)
  ride along inside `main` until whichever version is next cut, which is
  safe by construction since such changes have zero externally-visible
  behavior by definition.
- A tag-triggered deploy workflow needs a real PAT, not the default
  token — an easy trap to fall back into if this pattern is ever copied
  into a new workflow without remembering why.
