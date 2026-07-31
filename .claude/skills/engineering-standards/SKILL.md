---
name: engineering-standards
description: How substantial engineering work gets done in this repo — scoping, sequencing, verification discipline, and the quality bar to hold it all to. Use when planning a multi-step feature/refactor, breaking work into epics or issues, executing a mechanical extraction or restructuring, or reviewing whether work is actually done well rather than just done.
---

# Engineering Standards

## North star

This app's code should be something an experienced, skilled engineer is
genuinely proud of — not just code that passes review or satisfies a
ticket. Default to real rigor: SOLID, KISS, DRY, YAGNI, Tell-Don't-Ask,
high cohesion / low coupling. `docs/coding-standards.md` names these as a
review persona (Part 1) — apply them proactively while building, not only
retroactively when reviewing. When a task's honest scope is bigger than
what's cheapest to ship first, say so explicitly and let the user choose.
Don't silently narrow "modularize the codebase" into "extract the parts
that are easy to test" the way an earlier pass on this repo did before
being corrected.

## Scoping multi-step work

- **Ground scope in the actual current code, not a guess or a memory of
  it.** Before writing an epic or issue body, read/grep the real file(s).
  Cite real line numbers, real function names, real section boundaries.
  Every epic in this repo's history that held up (#10→#26→#203-206,
  #233→#234-242) was scoped this way; speculative scope written from
  imagination rots the moment implementation starts.
- **Decompose by genuine single-responsibility boundaries**, not by
  convenience or by whatever the file's existing section comments happen
  to say — read the section, then decide if it's actually one concern.
- **Sequence dependencies explicitly.** State what has to land first
  (a foundational module, a piece of test infrastructure) and what can
  land in any order. Don't leave the reader to infer it.
- **State what's explicitly out of scope, and why.** A missing feature
  is ambiguous; a deliberately-deferred one with a reason attached isn't.
- **Write acceptance criteria that are actually checkable** against the
  real repo state (a file exists, a test passes, a doc section says X),
  not vague intentions.
- **When new work reveals a decision from an earlier issue was wrong or
  too narrow, update that issue for the record rather than letting it go
  stale** — see how #219 was closed with a pointer once its scope turned
  out to be subsumed by #233/#234, not just abandoned silently.

## Delivering multi-step work

- **One focused PR per coherent slice, not one giant PR for the whole
  epic.** Group only genuinely small, related pieces together (the way
  #205 grouped several small API handlers, or #221 grouped three small
  client modules) — don't force unrelated concerns into one PR just to
  reduce PR count.
- **For a sequential/merge-gated epic, wait for explicit merge
  confirmation before starting the next piece**, unless told otherwise.
  Don't assume approval from silence.
- **Give an overview and a real technical/quality breakdown with every
  PR** in a multi-step epic: what was built, the specific engineering
  judgment calls made (and why), what was verified and how. Not a
  changelog restatement of the diff.
- **Match the risk-management approach to the actual call-site count.**
  A function with 25 call sites gets a thin same-named wrapper preserving
  the exact original signature (see `entries.js`'s extraction) — rewriting
  every call site is the wrong risk/reward trade for a mechanical move. A
  function with one or two call sites can just take a cleaner, fully
  parameterized signature directly (see `pyramid-stats.js`). Don't apply
  one pattern uniformly regardless of blast radius.

## Verification discipline

- **Verify empirically before trusting an assumption, especially about
  platform/tooling behavior.** This repo has real, non-obvious examples:
  confirming `localStorage` doesn't exist in the Vitest pool by writing a
  one-line probe test rather than assuming; confirming a preview
  deployment's admin endpoints were unauthenticated by actually POSTing to
  one; confirming a wrangler config change was safe via `--dry-run` output
  before it touched anything real; confirming a GitHub Actions fix worked
  by tracing the exact race condition in the workflow's own logic, not by
  hoping a retry made it go away.
- **For anything user-facing, drive it in a real browser** (or
  `wrangler dev` + the preview tools) — type-checking and unit tests
  confirm correctness, not that the feature works. Prefer checking the
  *effect* of a change (a computed style, a real DOM count, an actual
  network response) over checking that a function merely didn't throw.
- **Re-verify after a clean-state rebuild** for anything involving build
  output — a passing check against stale local artifacts isn't proof.
- **Treat a Claude-authored project doc's claims as unverified until the
  user confirms them**, especially anything phrased as "by design" or "a
  standard." A doc written in an earlier session can assert something as
  settled when it was actually an unverified assumption — this has
  happened in this repo (`docs/app-architecture.md`'s "no bundler, by
  design" line). When a doc's claim is about to constrain a real decision,
  ask before treating it as ground truth.

## Branching strategy

- **No branch work without a tracking issue.** Every change gets a
  GitHub issue first, created and scoped (see "Scoping multi-step work"
  above) *before* a branch exists for it.
- **Feature branches + PRs, always.** No direct commits or pushes to
  `main`, ever — not for a one-line fix, not for a config tweak, not
  because a change "only" touches a workflow file or docs. Create the
  branch off current `main` before the first commit, not after.
- **Watch for this specific mistake**: starting work, making edits, and
  only remembering to branch *after* the first commit already landed on
  `main`. It happened twice in this repo's actual history. The fix is
  not to `git commit --amend` or force-push `main` — create a new branch
  at the accidental commit (preserves the work), then `git reset --hard
  origin/main` to put `main` back where it belongs, then push the new
  branch normally. Prefer catching it before the first commit: check
  `git branch --show-current` is not `main` before running `git commit`.
- **Never force-push without asking first, full stop.** Not "when it
  seems safe" — always ask, every time, regardless of confidence. If a
  branch needs correcting before it's shared (no PR yet, no reviewers),
  prefer delete-and-recreate over force-push where that achieves the
  same result without touching history in place.
- **Before resuming work on an existing branch, check its actual current
  state** (`git fetch`, check for an existing PR, check if it's already
  merged) — don't assume a branch is still where you left it. If its PR
  already merged, start fresh off current `main`
  (`git checkout -B <branch> origin/main`) rather than rebasing or
  force-pushing the stale branch.
- **Attach required metadata (e.g. a release label) at creation time,
  not as a separate follow-up call**, if the tool supports it in one
  step — a required check that reads state from the creation event can
  otherwise fail once on a real race before self-correcting, producing a
  spurious failure notification. If a check keeps racing regardless, fix
  the check itself (query live state, not an event-time snapshot)
  instead of trying to out-time it from the client side.

## Project/issue workflow

- **Board status should reflect real state as work happens, not just at
  creation**: Ready (issue is scoped and ready to pick up) → In Progress
  (branch created) → In Review (PR opened) → Done (merge/close). Where
  automation exists for a transition, trust it and verify rather than
  hand-driving it.
- **Propose before implementing for open design questions** — discuss
  the approach first. **Concrete bug fixes with clear direction proceed
  directly**, no proposal step needed. The judgment call is whether
  there's a real design decision to make, not whether the change is
  small.
- **When the user reports something as done (e.g. "merged"), trust it
  and move on** — sync state and continue, don't spend a round-trip
  re-verifying a claim that costs nothing to trust and everything to
  question needlessly. Independently-noticed state (e.g. discovering a
  PR was merged without being told) is different — surface what was
  found, don't assume it was already known.
- **When a needed tool, library, or capability turns out to be missing,
  say so and discuss options before improvising a multi-step workaround
  to route around it.** A workaround built and presented as a fait
  accompli costs more trust than the time it saved.

## Process guardrails specific to this repo

See `CLAUDE.md` for repo-specific mechanics that don't generalize
(exact label names, this project's specific board field IDs, the
tag-based release/deploy pipeline). See `docs/coding-standards.md` for
the persona-based review framework and this project's own accumulated
standards (security rules, accessibility requirements, connectivity
constraints). This skill is the general engineering judgment and
workflow discipline underneath both — apply all three together.
