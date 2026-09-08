-- Fixes a real gap in migrations/0013_cutover_lead_to_sport.sql (#430/
-- #646, already merged): that migration repointed every entries.
-- discipline_id from 'lead' to 'sport', but never touched sport_style --
-- that column's own semantics weren't even fully worked out at that point
-- in the epic (it landed additively in 0012, and #643, the issue that
-- actually made it a required, user-facing field, merged much later).
--
-- Top Rope never existed as a distinguishable concept in this app before
-- #643 -- every Sport entry created before it (whether cut over from
-- 'lead' by 0013, or created directly as 'sport' any time between #649
-- offering it in the picker and #643 adding the Style control) was,
-- semantically, a led climb: Top Rope was never an option a user could
-- have meant, since nothing ever asked. 'lead' is therefore the correct,
-- not just convenient, backfill value -- not an arbitrary default.
--
-- Confirmed live on production before writing this migration, not just
-- reasoned about: 214 Sport entries across 4 distinct users (the three
-- seeded demo accounts plus one real user) currently have sport_style
-- IS NULL. Since #644/#645 shipped, this is a genuine, live correctness
-- bug -- the Style filter's default state (both styles checked) matches
-- neither 'lead' nor 'top_rope' against a NULL value, so every one of
-- these entries is currently silently invisible from the Sport view for
-- whichever real user owns them.
--
-- sync_cursor bumped on every row this actually changes, same reasoning
-- as 0014's own identical fix for the discipline_id rename itself: /log's
-- connectivity-first design (ADR-0006) means a real user's client reads
-- from its own already-synced local cache, not a fresh fetch -- without
-- this, an already-synced user's cache would keep silently showing NULL
-- (or whatever it last saw) forever, with no automatic recovery path.
UPDATE entries
SET sport_style = 'lead',
    sync_cursor = CAST(unixepoch() * 1000 AS INTEGER)
WHERE discipline_id = 'sport' AND sport_style IS NULL;
