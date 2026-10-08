-- The error reference a report was sent from, so it links to the log line (#1032).
ALTER TABLE issue_reports ADD COLUMN error_ref TEXT;
