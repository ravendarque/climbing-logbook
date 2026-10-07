ALTER TABLE issue_reports ADD COLUMN read_at TEXT;
ALTER TABLE issue_reports ADD COLUMN archived_at TEXT;
ALTER TABLE feedback_submissions ADD COLUMN read_at TEXT;
ALTER TABLE feedback_submissions ADD COLUMN archived_at TEXT;
-- destructive-migration: nothing reads or writes sharing_consent; it only ever held its default.
ALTER TABLE feedback_submissions DROP COLUMN sharing_consent;
