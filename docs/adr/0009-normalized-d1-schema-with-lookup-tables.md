# 9. Normalized D1 schema with real lookup tables, not CHECK-constrained enums

## Status

Accepted

## Context

Moving from one KV blob per resource type (fine for a single user, not
viable for per-user isolation) to D1 required a real relational schema
(#21). The first draft used plain `TEXT CHECK (type IN ('boulder',
'lead'))`-style columns for `type`/`status` — flagged as wasteful and
brittle: new disciplines are a plausible future addition, and extending a
`CHECK` constraint needs a schema migration, where a lookup table just
needs an `INSERT`.

A second, smaller question came up in the same design pass: D1/SQLite has
no true boolean type — even a column declared `BOOLEAN` is `INTEGER`
affinity underneath — so every 0/1 flag (`first_attempt`, `athlete_mode`,
`logbook_public`) needed a deliberate, consistent representation, not an
ad hoc choice per column.

## Decision

**Real lookup tables** (`disciplines`, `statuses`) with **natural `TEXT`
primary keys**, not opaque surrogate ids — the same slugs already used
across the client/API (`grade-data.js`, `status.js`: `'boulder'`,
`'lead'`, `'send'`, `'project'`, `'archived'`, `'checkout'` -- the latter
two renamed by #483, natural keys are exactly what made that a plain
`INSERT`/`UPDATE`/`DELETE` migration rather than a schema change). This keeps
the JSON wire format (`"type": "boulder"`) completely unchanged; the
resource-handler layer (`server/lib/d1-resource.js`) maps the JSON field to
the FK column internally — a column rename at the boundary, not a value
translation.

**`BOOLEAN` type declaration plus an explicit `CHECK (col IN (0,1))`** on
every 0/1 flag, applied consistently. The type declaration is
self-documenting even though SQLite doesn't enforce it; the `CHECK` is
what's actually enforced.

**`grade`/`date`/`video` stay app-level-validated**, not pushed into FK/
CHECK constraints — there's no clean SQL expression for `grade`'s
per-discipline valid set, and no real regex `CHECK` in SQLite for date/URL
shape.

**Real entity separation, not flat per-entry fields**: `Location` and
`Place` are their own tables (`user_id`-scoped, cascading deletes) rather
than `place`/`area`/`country` strings duplicated onto every entry —
`location → country` is a real functional dependency, so storing country
on every place/entry row would make it transitively dependent on the
wrong key and let duplicates silently drift (this had already caused a
real bug under the old flat-string design, #157/#158).

**`settings.logbook_public`** ships with this schema (default `1` — new
signups are public by default, matching the product's actual identity:
public logbook data, private performance/coaching data) even though the
UI to toggle it is a deliberately separate, deferred issue — #113's
per-user routing needs the column and its default to exist now.

## Consequences

- Adding a new discipline or status later is an `INSERT`, not a migration.
- Every row is scoped by `user_id` with `ON DELETE CASCADE`, which is the
  actual multi-tenant data-isolation mechanism at the storage layer
  (combined with the in-Worker session check, ADR-0002, which is the
  authorization boundary — the schema alone doesn't enforce cross-user
  isolation without that check also verifying a referenced place/location
  actually belongs to the caller).
- `type`/`status` on the wire never changed shape — no client code needed
  to change for this migration, only the storage layer underneath it.
- Place/location editing and deletion were explicitly deferred out of this
  schema's own scope (#159/#160) — deletion in particular has an
  unresolved question (what happens to entries still referencing a
  deleted record) that wasn't settled here.
