# Incident response

What to do when something's wrong in production, in order. Each failure mode has a playbook in `playbooks/`. After it's over, write a review from `post-incident-review.md`.

## Severity

| Severity | Examples | Alert | Respond |
|---|---|---|---|
| **P1: people can't use the app** | apex or `my.` down; 5xx above 5% for 5 minutes; D1 daily quota used up; sign-in failing for everyone | Discord #alerts (phone push) | Within the hour |
| **P2: degraded or at risk** | a new exception after a deploy; slow API for 30 minutes; a quota at 80%; emails failing | Discord #alerts, or email | Same day |
| **P3: worth knowing** | slow queries, a one-off error | Email, #monitoring | Weekly |

Where alerts come from: Better Stack (the home page, `my.` and `beta.` readiness) and Workers Issues post to **#alerts**; Cloudflare DDoS and certificate alerts go to **#monitoring**; deploys post to **#deploys**; reports and feedback to **#support**.

## The first 10 minutes

1. **Is it real?** Open `https://my.climbinglogbook.com/-/api/health/ready`: it answers `{"ok":true,"version":…}` when the Worker and database are fine. Check `status.climbinglogbook.com` and the Better Stack incident.
2. **Is it us or Cloudflare?** Check `https://www.cloudflarestatus.com/`. If Cloudflare is having an incident, follow `playbooks/cloudflare-incident.md`.
3. **Did a deploy just happen?** Compare the `version` from the health check with the latest run in #deploys or `gh run list --workflow deploy.yml --limit 3`. If the problem started with a deploy, roll back (`playbooks/bad-deploy.md`) before investigating.
4. **Look at the errors.** Workers Issues (dashboard: Workers & Pages → climbing-logbook → Issues) groups exceptions by type. Workers Observability's query builder shows `request.failed` and `request.unhandled` events by route and version.
5. **Decide: roll back or fix forward.** Roll back if a recent deploy caused it and rolling back is safe (no migration since the previous tag, or one that's backwards-compatible). Otherwise fix forward through a normal PR.
6. **Say what's happening** on the status page (templates below) if it's P1 or lasts more than a few minutes.

## Status page updates

Better Stack status page: `status.climbinglogbook.com`.

- **Investigating:** "We're looking into a problem with Climbing Logbook. You may not be able to [log in / save climbs / open your logbook]. Climbs you log offline are kept on your device and sync once it's fixed."
- **Identified:** "We've found the cause and are fixing it."
- **Monitoring:** "A fix is live. We're watching to make sure it holds."
- **Resolved:** "Everything's working again. Anything you logged offline will sync the next time you open the app."

## Switches and levers

| Lever | What it does | How |
|---|---|---|
| Roll back | Redeploys an earlier tag to production | `promote.yml`, `workflow_dispatch` with the tag (`playbooks/bad-deploy.md`) |
| Read-only mode | Stops every API write; reads keep working and the app queues changes | `READ_ONLY` Worker secret (`playbooks/security-breach.md`) |
| Close sign-ups | Requires an invite code to sign up | `BETA_GATE_ENABLED` is already `"true"` in every environment (ADR-0014) |
| Restore the database | Rewinds every user's data to a moment | D1 Time Travel (`playbooks/database.md`) |
| Rotate a secret | Replaces a leaked credential | `playbooks/secret-leaked.md` |
