# 37. Rate limiting through the Workers Rate Limiting binding

## Status

Accepted (#1049, 2026-10-11). Completes the move [ADR-0027](0027-database-backed-rate-limiting-on-sign-in.md)'s superseded note began in #1292.

## Context

Rate limits were counted in D1: Better Auth's limiter until #1292, and the report and feedback forms' own counter until #1049. Every check wrote a row, so a flood of requests became a flood of D1 writes against the database every user shares, and the check-then-increment wasn't atomic. The Workers Rate Limiting binding is GA, free, and counts at the edge without touching D1, though per location and approximately.

## Decision

Every rate limit counted over seconds is a Rate Limiting binding, through `server/lib/rate-limits.js`:

| Surface | Key | Limit |
|---|---|---|
| Auth POSTs | connection and path | 10 a minute |
| Sign-in | target account (hashed email) | 5 a minute |
| Saves | account | 120 a minute |
| Imports | account | 2 a minute (and 10 a day, #1045) |
| CSP reports | connection | 10 a minute |

- A connection is its IPv4 address, or its IPv6 /64, since one host is given a whole /64.
- A hit is a 429 with `Retry-After` and is logged as `rate_limit.hit`, with the surface.
- Limits over hours or days use something exact instead. The Durable Object counter from #1053 counts emails per address (3 an hour, 10 a day) and report and feedback submissions per connection (5 an hour each, as before). Daily imports and stored rows are counted in D1 (#1045).
- The `rate_limits` table is dropped.

## Consequences

- No limit check writes to D1.
- Report and feedback keep their 5-an-hour limit without the D1 writes.
- Anyone can trip a sign-in account limit for someone else's address. Accepted: it lasts a minute, applies only at the Cloudflare location the attempts came from, and is what slows credential stuffing across many IPs.
- Counts are per location, so a client spread across many locations gets a multiple of a limit. Accepted: these are brakes, and the exact limits sit elsewhere.
