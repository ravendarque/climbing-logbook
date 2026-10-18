# Email delivery failing

Verification, password reset and email change all depend on it.

**Detect:** people report missing emails in #support; Workers Observability shows `email.failed` events (`server/lib/email.js`).

**Diagnose:**
- Resend's dashboard: Emails (status of recent sends) and Domains (`climbinglogbook.com` must show Verified).
- Resend's status page: `https://resend-status.com/`.
- Resend's daily and monthly sending limits on the free plan.
- DNS: the Resend DKIM, SPF and bounce records are Terraform-managed (`infra/email.tf`); `dig TXT resend._domainkey.climbinglogbook.com` should return the key.

**Mitigate:**
- Resend outage: nothing to do but wait and post on the status page. Accounts already signed in are unaffected.
- Limit reached: emails resume at the next reset; to raise it, Resend's paid plan.
- Rejected API key: rotate `RESEND_API_KEY` (`secret-leaked.md`).
