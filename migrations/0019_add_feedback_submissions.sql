-- #925 -- "Tell us what you think" form storage.
--
-- Separate table from issue_reports (#924; Raven's own call, 2026-09-23:
-- "separate tables, it's cleaner"), same shape otherwise. Rate limiting
-- reuses the existing rate_limits table (migrations/0018) with its own
-- "feedback:<ip>" key prefix, not a second copy.
--
-- user_id ON DELETE SET NULL, not CASCADE -- same reasoning as
-- issue_reports: feedback is still useful context even if the submitting
-- account is later deleted.
CREATE TABLE feedback_submissions (
  id              TEXT PRIMARY KEY,
  message         TEXT NOT NULL,
  contact_email   TEXT,
  user_id         TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  -- Silently captured from document.referrer at submit time (server/api/
  -- feedback.js), not user-entered.
  source_page     TEXT,
  -- Optional, user-picked from a fixed dropdown (server/api/feedback.js's
  -- own SECTIONS list, same list as issue_reports.section).
  section         TEXT,
  -- Always 1 -- the disclaimer is inline notice text next to the submit
  -- button (Raven's own call), not an opt-in checkbox, so consent is
  -- implicit in submitting under that text. Stored as a real column
  -- rather than assumed, so any future submission path that DOESN'T show
  -- the disclaimer can't be mistaken for one that did.
  sharing_consent INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
