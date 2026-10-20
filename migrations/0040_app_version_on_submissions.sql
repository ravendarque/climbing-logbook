-- The release the person was running when they reported an issue or gave feedback (#1500).
ALTER TABLE issue_reports ADD COLUMN app_version TEXT;
ALTER TABLE feedback_submissions ADD COLUMN app_version TEXT;
