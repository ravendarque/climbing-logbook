-- Adds entries.grade_scale (#702, sub-issue A of #183) -- which of the 9
-- grade scales entries.grade is written in. Storage is now "as logged":
-- entries.grade stays exactly what was typed, grade_scale records the
-- notation it's in, and the canonical ordinal used for sort/filter/report
-- is always computed on demand from the pair (never a stored column --
-- see the spec's "Storage" section for why: this app filters/sorts in
-- application code over a small per-user result set, not a SQL WHERE/
-- ORDER BY, so there's no query-performance case for materializing it,
-- and nothing to keep in sync if a matrix anchor is ever corrected).
--
-- Real row counts confirmed on production before writing this (786
-- entries, 362 boulder / 424 sport, across 4 accounts -- the 3 seeded
-- demo accounts plus one real user; larger than the spec's own "tiny
-- dataset" assumption, but the backfill mapping below turned out fully
-- unambiguous once checked against the real distinct grade values):
--
-- Boulder: all 21 distinct grades present (`3` through `8B`) are the
-- app's old ad-hoc hybrid notation -- uppercase, but with letters below
-- `6A` (`5A`, `5B`, `5C`) that neither real Font-standard (no letters
-- below `6`) nor real Font-extended (lowercase) uses as-is. Every one of
-- them IS a 1:1 match for Font-extended's own progression once
-- lowercased. Every Boulder row backfills to font-non-standard, with
-- `grade` itself also lowercased to match that scale's real notation.
--
-- Sport: all 14 distinct grades present (`5c` through `8a`) are already
-- clean, valid labels in the corrected FFME table -- ZERO rows use the
-- old pre-correction low end (`1`/`1+`/`2`/`2+`/`3`/`3+`), confirmed by
-- direct query. So every Sport row backfills to french, verbatim, no
-- relabeling. The french-non-standard branch below is kept for
-- correctness/defensiveness (a future row using that old low end would
-- still classify correctly) but is unexercised by this dataset -- it
-- MUST stay in sync with server/api/logbook.js's own
-- LEGACY_SPORT_NON_STANDARD_GRADES (used for the same classification on
-- every new write until #703 ships a real picker).
--
-- sync_cursor bumped on every row this changes, same reasoning as
-- 0014/0015's own identical fix -- an already-synced client's local cache
-- otherwise never picks up the new column's value.
--
-- No NOT NULL constraint here -- D1/SQLite can't add a NOT NULL column
-- without a constant default in one ALTER TABLE (same limit 0005's own
-- comment documents), and the three UPDATEs below together cover every
-- row unconditionally (boulder OR sport is exhaustive for
-- discipline_id), so no row is ever left NULL in practice.
-- server/api/logbook.js's defaultGradeScale() guarantees every future
-- write also always sets it.
ALTER TABLE entries ADD COLUMN grade_scale TEXT;

UPDATE entries
SET grade_scale = 'font-non-standard',
    grade = LOWER(grade),
    sync_cursor = CAST(unixepoch() * 1000 AS INTEGER)
WHERE discipline_id = 'boulder';

UPDATE entries
SET grade_scale = 'french-non-standard',
    sync_cursor = CAST(unixepoch() * 1000 AS INTEGER)
WHERE discipline_id = 'sport' AND grade IN ('1', '1+', '2', '2+', '3', '3+');

UPDATE entries
SET grade_scale = 'french',
    sync_cursor = CAST(unixepoch() * 1000 AS INTEGER)
WHERE discipline_id = 'sport' AND grade_scale IS NULL;
