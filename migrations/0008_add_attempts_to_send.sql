-- Attempts-to-send counter (#37, epic #5 Phase 1) -- gates #14
-- (onsight/redpoint gap tracking), where it becomes a third data layer
-- (average attempts per send, per time bucket) behind #14's two
-- overlaid grade-trend lines. Nullable, additive, no backfill -- older
-- entries just won't have a count. No non-constant DEFAULT (D1 rejects
-- one on ALTER TABLE ADD COLUMN, confirmed in migrations/0005) and none
-- would make sense here anyway, since the count varies per entry.
ALTER TABLE entries ADD COLUMN attempts_to_send INTEGER CHECK (attempts_to_send IS NULL OR attempts_to_send >= 0);
