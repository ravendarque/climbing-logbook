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
- **MINOR** — new user-facing capability or a significant behavior change,
  backward-compatible. Example from this project's actual history: moving
  from a shared `ADMIN_KEY` string to Cloudflare Access changed *how* you
  log in, but no existing data or functionality broke — a minor bump
  (`v1.0.0` → `v1.1.0`).
- **PATCH** — a bug fix that doesn't change intended behavior.
- **No bump** — docs-only changes, infrastructure/provisioning changes that
  don't alter the deployed app's behavior (e.g. moving KV provisioning from
  a one-off script to Terraform), refactors, CI/tooling changes, chores.
  These are real work, just not release-worthy on their own — they ride
  along into whichever version comes next.

The test for MINOR vs. no-bump isn't "which files changed" or "how much
work was it" — it's **"would a user of the app notice or need to know about
this."** A Terraform rewrite of how a KV namespace gets created is
substantial engineering effort and zero user-facing change; a new login
flow is comparatively little code and a real behavior change every user
will hit.

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
time, by applying one of three labels to the PR:

- `release: major`
- `release: minor`
- `release: patch`

**No release label → no release.** A PR with none of these three labels
just merges normally with no version bump — this is how docs-only/
infra-only/refactor changes ride along without triggering anything. Apply
the label based on the criteria above before merging.

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
