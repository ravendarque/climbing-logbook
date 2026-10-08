# 35. Capacity and operational targets

## Status

Accepted (#1303, 2026-10-08). The source of truth for these figures: change them with a new ADR that supersedes this one.

## Context

Capacity and reliability work kept being sized against today's numbers: one real user and three demo accounts. That's the wrong yardstick for a public service. The only agreed figures were a user count and data volume (#309, #1045), and nothing recorded traffic, availability or recovery targets. Sharding (#309), SLOs (#1050), quota warnings (#1054), load testing (#1065) and backups (#1068) all need the same numbers.

## Decision

### Design point

**50,000 registered users.** Raven called this "fine for launch" (#309, 2026-08-05), and the design must reach it without an emergency rebuild.

### Usage assumptions

| | Figure | Reasoning |
|---|---|---|
| Daily active users | 10%: **5,000** | Typical for a personal logging app with mostly occasional users |
| Monthly active users | 40%: **20,000** | |
| Busiest hour | 10% of the day's users: **500** | The audience is global, so use spreads across time zones. The busiest hour is about twice the hourly average, allowing for a skew towards Europe, North America and weekends. |
| Opens per active user per day | **5** on average | About 10 on a climbing trip and 0 on a work day: the tick list, beta in notes, insights. Climbers close the app to save battery, so each open counts as a cold start with a sync. |
| Requests per open | about **8** | Boot, session, settings, delta sync |
| Saves per active user per day | **10** | A session logs about 10 to 30 climbs, spread across climbing days |
| Climbs per account | median **150**, average **500**, top 1% at **5,000+** | A long tail. The per-account limits are in #1045. |
| Public logbook views | **20,000 a day** | Shared profile links; lumpy if one goes viral |

### What those give

| | Per day | Busiest hour |
|---|---|---|
| Requests | about **270,000** | about 27,000 (7.5 a second) |
| D1 rows written | about **350,000** (a save writes about 7 rows, with indexes and the `account_usage` counters) | about 35,000 |
| D1 rows read | about **3 to 5 million**, mostly the sync on each open | |
| D1 storage | about **20 GB** (25 million climbs) | |
| Email | about **100 to 300** (sign-ups, verification, resets) | |

Against today's limits:
- **Workers Free** allows 100,000 requests and 100,000 D1 rows written a day, 5 million rows read, and 500 MB per database. It runs out at about **1,500 daily users** (about 15,000 registered), on writes first.
- **One D1 database** holds 10 GB on the paid plan, so it fills at about **25,000 users**, and the data has to be split across databases (#309) before the design point.
- **Resend's free tier** (100 emails a day) runs out before the design point too.

### Operational targets

| Area | Target |
|---|---|
| **Availability** | 99.9% a month for the API (about 43 minutes of downtime). The app works offline, so the user-facing impact is smaller. SLOs and error budgets in #1050. |
| **Speed** | The log page is usable within 1.5 s, before the sync runs, including over a throttled connection (the boot timing test). API p95 under 300 ms for reads and 500 ms for saves. |
| **Sync** | The offline queue empties within 1 minute of reconnecting. A save shows on the person's other devices within 5 minutes. |
| **Data loss and recovery** | At most 24 hours of data lost when restoring from off-platform backups (minutes with D1 Time Travel). Service restored within 4 hours. #1068 designs this and #1067 rehearses it. |
| **Capacity triggers** | Warn at 70% of any platform quota and act at 90% (#1054). Move to Workers Paid at about **1,000 daily users**. Split the database when it reaches **50%** of its size limit. Move off Resend's free tier at 70 emails a day. |
| **Cost ceiling** | Set when the account moves to the paid plan, with a spend alert. |
| **Retention** | Logs 7 days. Backups: 30 daily and 6 months of weekly. Deleted climbs' content purged after 30 days (#1051). |
| **Security fixes** | Critical within 2 days, high within 7, medium within 30. |
| **Incident response** | A full outage is looked at within 1 hour while Raven is awake; a degraded service within a day. These are internal targets. Public copy stays "we try to". |

## Consequences

- **Design against the design point, not today.** Anything sized to today's data, such as a nightly export that blocks the database while it runs, isn't acceptable as a long-term design.
- **The plan change and the database split are planned triggers**, watched by #1054, not emergencies.
- **Load tests (#1065) use the usage assumptions** as the baseline scenario, and SLOs (#1050) use the operational targets.
- **When real usage data exists**, replace the assumptions with measured figures in a new ADR.
