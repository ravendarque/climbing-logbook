-- #251 -- flags the three seeded, publicly-viewable demo accounts
-- (beginnerdemo/intermediatedemo/advanceddemo). Distinct from
-- logbook_public (which any real user can also set): is_demo additionally
-- unlocks performance-insight data on the public read-only page
-- (server/api/public-data.js), which stays owner-only for every real user
-- regardless of logbook_public (#8's decision, unaffected by this column --
-- Grade Pyramid etc. are still private for real accounts, this is a
-- deliberate demo-only carve-out over synthetic, not real, data).
-- Same NOT NULL DEFAULT 0 boolean pattern as athlete_mode/logbook_public.
ALTER TABLE settings ADD COLUMN is_demo BOOLEAN NOT NULL DEFAULT 0 CHECK (is_demo IN (0,1));
