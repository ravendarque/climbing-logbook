# Bad deploy

**Detect:** the problem starts within minutes of a deploy in #deploys; Workers Issues shows a new error type on the new `version`.

**Diagnose:**
- `curl -s https://my.climbinglogbook.com/-/api/health` shows the live version.
- `gh run list --workflow deploy.yml --limit 5` and `gh run list --workflow promote.yml --limit 5` show what went out and when.
- `git log --oneline <previous-tag>..<bad-tag>` shows what changed.

**Mitigate:**
1. Find the last good tag: `git tag --sort=-creatordate | head`.
2. **If a migration ran between the two tags,** check it before rolling back: the old code must work against the new schema. Migrations here only add (`docs/versioning.md`, Database migrations), so this is usually fine. If it isn't, fix forward instead.
3. Roll production back: `gh workflow run promote.yml -f tag=<last-good-tag>`, then watch it with `gh run watch`.
4. Confirm with the health check that `version` is the old tag.
5. Beta follows `main`; to roll beta back too, revert the bad PR on `main`.

**Then:** fix the bug on a branch, and write a review if users were affected.
