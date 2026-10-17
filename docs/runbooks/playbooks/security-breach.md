# Security breach

A personal-data breach is any security incident that loses, exposes, changes or destroys personal data: someone reading another person's logbook, a leaked database copy, a stolen session, health information exposed. UK GDPR gives **72 hours from becoming aware** to tell the ICO, if the breach is likely to put people at risk.

## 1. Contain (first hour)

- Stop further damage: switch on read-only mode (below), roll back a bad deploy (`bad-deploy.md`), suspend an abusing account from the admin host, or rotate a leaked secret (`secret-leaked.md`).
- Note the time you became aware. The 72 hours run from then.

## 2. Preserve evidence

Before changing anything else, save what shows what happened: Workers Observability queries and Workers Issues for the period (logs only last days), the Cloudflare audit log (Manage Account → Audit Log), the admin audit log on the admin host, Security → Events, and the relevant deploy runs. Save copies outside Cloudflare.

## 3. Assess

- What data, whose, how many people, and since when.
- Is health information involved (special category)? That raises the risk.
- Is the risk to people likely, and is it high?

## 4. Decide on the ICO, and record the decision either way

- **Likely risk to people:** report to the ICO within 72 hours: `https://ico.org.uk/for-organisations/report-a-breach/`. If you don't know everything yet, report what you know and add the rest later.
- **Unlikely risk:** don't report, but write down why in the post-incident review. UK GDPR requires every breach to be recorded, reported or not.

## 5. Tell the people affected, if the risk to them is high

Template:

> We're writing to tell you about a security problem that affected your Climbing Logbook account. On [date], [what happened]. This exposed [what data]. We've [what we did to stop it]. You may want to [what they can do, for example change their password]. We're sorry this happened. If you have any questions, [contact us](https://climbinglogbook.com/help/report-an-issue/).

## 6. Fix and disclose

- Fix the cause through a normal PR.
- If it was a vulnerability in the code, publish a GitHub Security Advisory once the fix is live, crediting the reporter if they want it.
- Write the review from `../post-incident-review.md`, including the ICO decision and its reasons.

## Read-only mode

Stops every write to the app's API without taking the site down: people can still open their logbook, and anything they save waits in the app's offline queue until it's switched off. The admin host still works, so moderation can carry on.

- **On:** `echo true | npx wrangler secret put READ_ONLY --env production` (and `--env beta`, which shares the database).
- **Off:** `npx wrangler secret delete READ_ONLY --env production` (and `--env beta`).

Signing out still works, so nobody is left signed in on a device they think they've left. Everything else that writes waits, including sign-up, feedback and account deletion: keep read-only periods short, and answer any deletion request made meanwhile once it's off.

A secret change takes effect without a deploy. Check with a write from the app: it's queued, and the sync line shows it waiting.
