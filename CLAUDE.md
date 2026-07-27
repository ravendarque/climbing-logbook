# Working in this repo

Process rules for how Claude works in this repository. Code-level standards
(security, accessibility, infra conventions, etc.) live in
`docs/coding-standards.md` — this file is about workflow, not code.

## Git and GitHub workflow

- **Every change needs a GitHub issue, created and linked to its branch,
  before implementation starts.** No branch work without a tracking issue.
- **Feature branches + PRs, always** — no direct commits/pushes to `main`,
  even for small fixes.
- **Never force-push without asking first, full stop.** Not "when it seems
  safe" — always ask, every time, regardless of how confident the situation
  looks.
- **Always check remote/branch/PR state (`git fetch`, check for an existing
  PR) before resuming work on an existing branch.** Don't assume a branch is
  still where you left it — its PR may have already merged.
- **If a branch's PR is already merged, start fresh off current `main`**
  (`git fetch origin main && git checkout -B <branch> origin/main`) rather
  than rebasing or force-pushing the stale branch. If the branch has real
  unmerged commits beyond the merged history, rebase those onto the new base
  instead of discarding them.

## GitHub Project board workflow

- Move an issue to **Ready** once it has enough information to be picked up.
- Move to **In Progress** when work starts, and link the feature branch.
- Move to **In Review** when a PR is opened, and link the PR.
- **Done** happens automatically on merge/close (board's built-in Workflows).

## Releases

Every PR needs a `release: major/minor/patch/none` label before merge
(enforced by a required check) — see `docs/versioning.md` for what
qualifies. Versioning is tag-based (`vX.Y.Z` git tags), not a
`package.json` commit.

## GitHub API usage (rate limits)

GitHub's secondary rate limit caps **content-generating requests at 500/hour
and 80/minute** — far tighter than the 5,000-point primary budget, and it's
the one this project's workflow actually hits, since nearly every step
(issue create, PR create, merge, comment) is a content-generating mutation.
Mutations are also weighted 5x for the GraphQL secondary points limit vs. a
plain read.

- **Pace mutations** — don't fire GitHub creates/merges/comments back-to-back
  without a beat between them, and never issue them concurrently/in
  parallel. (GitHub's own guidance: pause at least 1 second between mutative
  requests, avoid concurrent requests.)
- **Skip redundant existence-check reads** where the mutation can just fail
  safely instead — e.g. don't `list_pull_requests` to check whether a PR
  already exists before calling `create_pull_request`; attempt the create
  and handle failure.
- **Don't retry into a rate limit.** If a call fails with a rate-limit error,
  stop and report it rather than retrying — retrying risks the account being
  flagged for abuse (per GitHub's docs: continuing to make requests while
  rate limited can result in the integration being banned).
- **Projects v2 needs the `project` OAuth scope** (`gh auth status` to check,
  `gh auth refresh -s project` to add it) — without it, `gh project`
  commands fail even though issue/PR commands work fine. Prefer `gh`/
  GraphQL directly over GitHub MCP-server tools for board work — MCP-based
  GitHub tools have had confirmed Projects v2 access gaps.

## Development workflow

- **Propose before implementing** for open design questions — discuss the
  approach first, don't just build it. **Concrete bug fixes with clear
  direction proceed directly** without a proposal step.
- **Verify end-to-end before claiming something works** — for UI/user-facing
  changes, actually drive it in a browser (or `wrangler dev` + Playwright),
  don't just read the diff and assert it's correct. This project has had
  multiple cases where an unverified "this is fixed" claim turned out wrong
  once actually tested.
