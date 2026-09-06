-- Completes the Lead -> Sport rename (#430/#646). Safe now, unlike doing
-- this in migrations/0012_rename_lead_to_sport.sql alongside adding
-- 'sport': #641's app code already tolerates both 'lead' and 'sport'
-- existing side by side (VALID_TYPES accepts both, nothing depends on
-- 'lead' specifically being present), and #649's discipline picker no
-- longer offers/submits "lead" for new entries -- so converting every
-- remaining 'lead' reference and retiring the row is a no-op for
-- currently-live code, not a break.
--
-- Order matters, same reasoning as 0004_rename_statuses.sql and 0012's
-- own comment: neither FK referencing disciplines(id) (entries.
-- discipline_id, settings.active_discipline) has ON DELETE CASCADE, so
-- the old row can't be deleted while anything still points at it --
-- repoint every reference first, only then delete the old row.
UPDATE entries SET discipline_id = 'sport' WHERE discipline_id = 'lead';
UPDATE settings SET active_discipline = 'sport' WHERE active_discipline = 'lead';

DELETE FROM disciplines WHERE id = 'lead';
