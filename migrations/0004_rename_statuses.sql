-- Renames the wishlist/abandoned status keys to checkout/archived (#483).
-- Deferred from #63/#473's icon redesign -- the display text already
-- reads "Check out"/"Archived" everywhere (public/log/index.html's radio
-- labels, the filter-checkbox text, the status-badge tooltip); only the
-- *internal* id/value was never renamed. Surfaced by #27's CSV/JSON
-- export, which writes the raw internal value and so leaked
-- wishlist/abandoned to users who never see those words in the UI
-- itself.
--
-- Order matters: entries.status_id REFERENCES statuses(id) has no
-- ON DELETE CASCADE (unlike user/locations/places), so the old rows
-- can't be deleted while any entry still points at them -- insert the
-- new rows first, repoint every existing entry, only then delete the
-- old rows. Confirmed empirically against local D1 (not just inferred
-- from the schema) that doing this out of order does fail the FK
-- constraint.
INSERT INTO statuses (id, name) VALUES
  ('checkout', 'Check out'),
  ('archived', 'Archived');

UPDATE entries SET status_id = 'checkout' WHERE status_id = 'wishlist';
UPDATE entries SET status_id = 'archived' WHERE status_id = 'abandoned';

DELETE FROM statuses WHERE id IN ('wishlist', 'abandoned');
