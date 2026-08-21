-- Epoch-ms cursor + soft-delete tombstone for delta sync (#499, ADR-0019
-- part 2). Prerequisite for #500's delta-fetch endpoint; the delta query
-- logic itself isn't built yet -- this is schema only.
--
-- sync_cursor: integer Unix-epoch milliseconds, NOT the existing
-- second-precision, display-oriented created_at/updated_at TEXT columns
-- (those stay exactly as they are, internal/display-only). Populated by
-- the application layer (Date.now(), server/api/{logbook,places,
-- locations}.js's own buildRow()), not a column DEFAULT -- confirmed
-- empirically that D1 rejects a non-constant DEFAULT on ALTER TABLE ADD
-- COLUMN ("Cannot add a column with non-constant default"), even though
-- the same expression works fine as a CREATE TABLE default or in a
-- plain UPDATE. Existing rows are backfilled from their own created_at
-- (scaled to ms) below, preserving relative chronological order among
-- them rather than collapsing every pre-existing row to the exact
-- moment this migration ran.
--
-- Same-millisecond collisions are expected, not a bug -- #344's own
-- Phase G notes settled on `>=` delta comparisons with idempotent
-- client-side merge-by-id to handle them, not a stricter monotonic
-- sequence.
--
-- deleted_at: same epoch-ms shape, NULL for a live row. entries only --
-- places/locations have no delete capability today (ADR-0009 deferred
-- that scope out already), so there's nothing yet for a tombstone on
-- either to represent. No pruning for now (ADR-0019's own consequence).

ALTER TABLE entries ADD COLUMN sync_cursor INTEGER NOT NULL DEFAULT 0;
ALTER TABLE entries ADD COLUMN deleted_at INTEGER;
ALTER TABLE places ADD COLUMN sync_cursor INTEGER NOT NULL DEFAULT 0;
ALTER TABLE locations ADD COLUMN sync_cursor INTEGER NOT NULL DEFAULT 0;

UPDATE entries SET sync_cursor = CAST(unixepoch(created_at) * 1000 AS INTEGER);
UPDATE places SET sync_cursor = CAST(unixepoch(created_at) * 1000 AS INTEGER);
UPDATE locations SET sync_cursor = CAST(unixepoch(created_at) * 1000 AS INTEGER);

-- (user_id, sync_cursor) -- the exact shape #500's own delta query
-- (`WHERE user_id = ? AND sync_cursor >= ?`) will need; added now, in
-- the same migration that introduces the column, rather than as a
-- separate later one.
CREATE INDEX idx_entries_user_sync_cursor ON entries(user_id, sync_cursor);
CREATE INDEX idx_places_user_sync_cursor ON places(user_id, sync_cursor);
CREATE INDEX idx_locations_user_sync_cursor ON locations(user_id, sync_cursor);
