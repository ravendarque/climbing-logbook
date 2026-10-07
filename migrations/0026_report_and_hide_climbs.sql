-- Set by the admin: the climb stays in its owner's logbook but leaves the public one.
ALTER TABLE entries ADD COLUMN hidden_at TEXT;

-- What a report is about, when it came from a public logbook. No foreign keys: a report outlives what it reported.
ALTER TABLE issue_reports ADD COLUMN reported_user_id TEXT;
ALTER TABLE issue_reports ADD COLUMN reported_entry_id TEXT;

-- destructive-migration: rebuilds admin_audit_log to widen its action CHECK; every row is copied across first.
CREATE TABLE admin_audit_log_new (
  id         TEXT PRIMARY KEY,
  action     TEXT NOT NULL CHECK (action IN ('suspend', 'unsuspend', 'delete', 'ban', 'hide', 'unhide')),
  user_id    TEXT NOT NULL,
  username   TEXT NOT NULL,
  email      TEXT NOT NULL,
  detail     TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO admin_audit_log_new (id, action, user_id, username, email, created_at)
  SELECT id, action, user_id, username, email, created_at FROM admin_audit_log;
DROP TABLE admin_audit_log;
ALTER TABLE admin_audit_log_new RENAME TO admin_audit_log;
CREATE INDEX admin_audit_log_created_at ON admin_audit_log (created_at);
