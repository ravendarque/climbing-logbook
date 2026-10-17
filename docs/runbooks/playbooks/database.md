# Database errors, quota or data loss

**Detect:** the readiness check fails (`/-/api/health/ready` reports the database), 5xx on every data route, Cloudflare's D1 quota email, or a user reporting missing climbs.

**Diagnose:**
- Dashboard: Storage & Databases → D1 → climbing-logbook → Metrics (rows read and written, storage) and Insights (slow queries).
- `npx wrangler d1 insights climbing-logbook` for the slowest queries.
- Quota: Workers Free allows 5 million rows read and 100,000 rows written a day, reset at midnight UTC. A quota error says so in the response.

**Mitigate:**
- **Quota used up:** nothing restores it before midnight UTC except moving to Workers Paid. The app keeps working offline on people's devices, and queued climbs sync once the quota resets. Post on the status page.
- **A bad write or broken migration damaged data:** restore with Time Travel. It rewinds **everyone's** data, so anything written since is lost:
  1. Every deploy and promote logs a bookmark just before migrating ("Record D1 restore point before migrating"). Use that, or find one: `npx wrangler d1 time-travel info climbing-logbook --timestamp=<ISO time before the damage>`.
  2. `npx wrangler d1 time-travel restore climbing-logbook --bookmark=<bookmark>`.
  3. Time Travel keeps 7 days on the current plan (30 on Workers Paid). Off-platform backups are #1068.
- **One person's data:** Time Travel can't restore one account on its own. Until #1068's logical backups exist, restore to a copy is the only route: see #632.
- **Demo accounts after a restore:** re-run `node scripts/seed-demo-accounts.mjs` against the restored database (#632).
