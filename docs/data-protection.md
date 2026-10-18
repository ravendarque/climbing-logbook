# Data protection: record of processing

The record UK GDPR Art. 30 requires. The small-organisation exemption doesn't apply, because health information is processed (Art. 30(5)). It's the groundwork for the review and DPIA in #1064, and it has to agree with the privacy page (`views/help/privacy/index.md`). Not legal advice.

**Controller:** the project owner, an independent, non-trading project run from the UK. Contact goes through Report an issue. The owner's name and address are kept out of this public repo; the regulator gets them on request.

**People whose data is processed:** account holders; visitors to public profiles and the marketing page; anyone who sends feedback or an issue report; invite recipients.

## Processors

| Processor | What for | Where | Transfer safeguard |
|---|---|---|---|
| Cloudflare | Hosting (Workers), the database (D1), backups (D1 Time Travel), logs, visit statistics, bot checks (Turnstile), firewall | Global | UK Extension to the EU-US Data Privacy Framework (the UK-US data bridge); if that certification lapses, the EU SCCs with the UK Addendum ([Cloudflare DPA](https://www.cloudflare.com/cloudflare-customer-dpa/) v6.4, §6.2(b), §6.4), part of the self-serve subscription agreement |
| Resend | Sending account emails | US | UK Extension to the EU-US Data Privacy Framework (the UK-US data bridge), and the EU SCCs with the UK Addendum ([Resend DPA](https://resend.com/legal/dpa) §6.4, §11.1), accepted with Resend's terms |
| Proton | The `support@` mailbox: mail people send to support (#1444) | Switzerland | UK adequacy regulations for Switzerland |
| GitHub | Source code and issue tracking only; no user data | US | Not applicable |
| Discord | Alert and support-notification channel; carries no personal data or submitted text (`server/lib/support-notify.js`) | US | Not applicable |

## Processing activities

| Activity | Purpose | Lawful basis | Personal data | Retention | Where it's enforced |
|---|---|---|---|---|---|
| Accounts and sign-in | Let people use their own logbook | Contract | Username, email, password hash, sessions (no IP address or browser, #1423), verification and reset links; with two-step sign-in, the encrypted TOTP secret and backup codes, and recovery requests (#1436) | Account: until the user deletes it. Sessions: deleted 7 days after expiry. Links: deleted once expired. Two-step secret and codes: until turned off or the account is deleted. Recovery requests: 30 days after they finish | `server/lib/auth.js`, `server/lib/cleanup.js` (`SESSION_GRACE_DAYS`), `server/lib/remove-account.js` |
| The logbook | Record climbs and show the user's own insights | Contract | Climbs (name, grade, date, notes, video link, attempts, Exertion, moves), places, locations, settings | Until the user deletes it or the account. A deleted climb is stripped at once and its marker removed after 30 days | `server/api/entries.js`, `server/lib/cleanup.js` (`TOMBSTONE_DAYS`, `STRIP_ENTRY_CONTENT`) |
| Health information | Find patterns in the user's climbing performance | Explicit consent (Art. 9(2)(a)), the Health Data Agreement | Pain and injury details; later cycle phase and energy and mood (#1409, #1410) | Until consent is withdrawn (deleted at once) or the account is deleted | `server/lib/health-consent.js`, `shared/health-consent.js`, `consents` table |
| Consent record | Show who agreed to what, and when | Legal obligation (Art. 7(1)) | User id, purpose, wording version, dates granted, superseded and withdrawn | With the account | `consents` table |
| Public profiles | Share a logbook the user chose to make public | Contract | Climbs and places of a public logbook; never health information, Exertion or moves | While the logbook is public | `server/api/public-data.js`, tested in `test/authorization-matrix.test.js` |
| Feedback and issue reports | Fix problems and answer people | Legitimate interests | Message, optional contact email, user id, the page it was sent from | **No limit set** | `feedback_submissions`, `issue_reports` |
| Moderation | Act on reports and abuse | Legitimate interests | Suspensions, bans (email or username), admin actions with the affected username and email | **No limit set**; the audit log keeps a deleted account's username and email | `account_suspensions`, `banned_identities`, `admin_audit_log` |
| Invites | Run the closed beta | Legitimate interests | Invite code, optional pinned email, who used it | Until removed; references are cleared when an account is deleted | `beta_invites`, `server/lib/remove-account.js` |
| Security and abuse logs | Keep the service working and secure | Legitimate interests | Request logs with user id, route and status; no passwords, tokens, notes or health information (allowlist) | Workers Logs retention (days) | `server/lib/log.js` |
| Rate limiting | Stop abuse | Legitimate interests | IP-derived keys, user id | Seconds to minutes | `server/lib/rate-limits.js` |
| Bot checks | Stop automated sign-ups | Legitimate interests | Whatever Turnstile collects in the browser | Turnstile's own | `server/lib/turnstile.js` |
| Visit statistics | See which pages are used | Legitimate interests | Cookieless page views (no profile of the visitor) | Web Analytics' own | Cloudflare Web Analytics |
| Account emails | Verification, password reset, email change | Contract | Email address, username | Resend's own sending logs | `server/lib/email.js` |
| Backups | Recover from data loss | Legitimate interests | A full copy of the database | 7 days on the current plan (30 on Workers Paid) | D1 Time Travel; off-platform backups in #1068 |
| Usage counters | Enforce per-account limits | Contract | Entry and import counts per user | With the account | `account_usage`, `import_runs` |

## Gaps to settle

- **No retention limit on feedback, issue reports or the moderation audit log.** The audit log also keeps a deleted account's username and email. Each needs a period, and the cleanup cron needs to enforce it.

## Security measures

Per-user isolation on every query, tested by the authorization matrix (#1070); explicit consent and server-side enforcement for health data (#1114); an allowlist logger (#1027); per-account limits (#1045); rate limits and bot checks on sign-up and forms; Cloudflare Access on the admin host (ADR-0034); security headers and CSP (#1042); account deletion (#310).
