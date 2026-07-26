# Versioning Strategy

## Deploys vs. releases — these are different things here

This app deploys continuously: every merge to `main` triggers `deploy.yml`
and goes live immediately (see `docs/infra-architecture.md`). A version tag
is **not** a release gate — nothing waits for one, and nothing about what's
live depends on whether the current commit is tagged.

A version tag is a **human-deliberate marker** on top of that continuous
stream, placed when a change is significant enough to name and describe.
Most commits never get their own tag; they just ride along inside whichever
version eventually gets cut next.

## What SemVer means for this project

Standard `MAJOR.MINOR.PATCH`, interpreted for a single continuously-deployed
app rather than a published library with a versioned API contract:

- **MAJOR** — a breaking change to data or behavior that would break or
  surprise an existing user: an incompatible schema change, a removed
  feature, a change that requires manual data migration.
- **MINOR** — either of two things, per the SemVer spec:
  - new user-facing capability or a significant behavior change,
    backward-compatible (the spec's "new functionality... to the public
    API"). Example from this project's actual history: moving from a
    shared `ADMIN_KEY` string to Cloudflare Access changed *how* you log
    in, but no existing data or functionality broke — a minor bump
    (`v1.0.0` → `v1.1.0`).
  - a **substantial internal-only rewrite** that doesn't fix a bug and
    adds no user-facing capability, but is significant enough that the
    team wants it to register in the version history. The spec explicitly
    allows this ("MAY be incremented if substantial new functionality or
    improvements are introduced within the private code"). Example:
    migrating the UI's styling from hand-rolled CSS to Tailwind touches
    nearly every template and is zero *intended* user-facing change — but
    it's a big enough rewrite of what's actually running in production to
    be worth a minor bump, once, at the point the migration is complete.
- **PATCH** — strictly a bug fix: an internal change that fixes incorrect
  behavior. Nothing else qualifies as PATCH, no matter how much shipped
  code it touches — per the spec, "a bug fix is defined as an internal
  change that fixes incorrect behavior," full stop.
- **No bump** — everything that's neither a bug fix, a user-facing
  addition, nor judged "substantial" enough to register: docs-only
  changes, CI/tooling changes, dev-only scripts and local tooling (seed
  scripts, review helpers, one-off migration/ops scripts run outside the
  app's own runtime), dependency/chore bumps that don't change shipped
  code, infrastructure/provisioning changes that don't alter the deployed
  app's behavior (e.g. moving KV provisioning from a one-off script to
  Terraform), and refactors too small to be worth flagging. These are real
  work, just not release-worthy on their own — they ride along into
  whichever version comes next.

The test isn't "which files changed" or "how much work was it" — for
MINOR-as-new-capability vs. no-bump it's **"would a user of the app notice
or need to know about this."** For MINOR-as-substantial-rewrite vs. no-bump
it's a judgment call the team makes deliberately, not something that falls
out of a mechanical rule — most refactors stay no-bump; only the rare ones
big enough to be worth a line in the release notes get flagged, and only
once, at the point the rewrite is actually complete (not on every
incremental PR that contributes to it).

## Where the version lives

- `package.json`'s `version` field — the single source of truth for "what
  version is this checkout."
- A git tag `vX.Y.Z` on the commit the version was cut from.
- A GitHub Release on that tag, with auto-generated notes (merged PRs since
  the last tag).

## Cutting a release

Automatic on merge, driven by a label — not a separate step to remember
after the fact. This project doesn't use a commit-message convention like
Conventional Commits (auto-detecting bump type from commit messages isn't
reliable without one), so the bump type is instead decided once, at review
time, by applying one of four labels to the PR:

- `release: major`
- `release: minor`
- `release: patch`
- `release: none` — an explicit, deliberate "this doesn't warrant a
  version bump" for docs-only/infra-only/refactor-too-small-to-flag
  changes.

**A release label is required before merge** — `.github/workflows/
require-release-label.yml` runs as a required check on every PR and fails
until one of the four labels above is applied. This isn't optional
bookkeeping: for three weeks (see issue #173) "no label → no release" meant
PRs merged unlabeled by default, and 58 of them did, silently bundling real
user-facing changes into an unreleased, untagged backlog. Making the
release decision itself required — even when the answer is "none" — is
what prevents that from happening again. `release: none` merges with no
version bump; the other three trigger the release workflow below.

When a labelled PR merges, `.github/workflows/release.yml` reads the label,
calculates the new version with the `semver` package, bumps `package.json`,
commits it to `main`, creates and pushes the `vX.Y.Z` tag, and creates a
GitHub Release with auto-generated notes — no manual step required.

`workflow_dispatch` (Actions tab → "Release" → Run workflow) still exists
as a manual override, for a corrective release or anything unusual that
doesn't fit the normal PR-merge flow.

## This project's version history bootstrap

Versioning was introduced after the fact, on an already-shipped project —
there's no attempt to retroactively version every prior commit. Two tags
were placed once, marking the actual boundary that mattered:

- **`v1.0.0`** — the initial standalone product (split out of the `my-limn`
  monorepo, all security/accessibility fixes, Terraform-managed infra),
  tagged on the last commit before the Access auth change.
- **`v1.1.0`** — the `ADMIN_KEY` → Cloudflare Access auth change, the first
  real "minor" per the criteria above. Infra and documentation work that
  landed alongside it rode along without triggering a separate bump.

Everything from here forward goes through the release workflow above.
