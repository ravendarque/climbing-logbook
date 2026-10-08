-- destructive-migration: rebuilds admin_audit_log to add 'view' to its action CHECK; every row is copied across first.
CREATE TABLE admin_audit_log_new (
  id         TEXT PRIMARY KEY,
  action     TEXT NOT NULL CHECK (action IN ('suspend', 'unsuspend', 'delete', 'ban', 'hide', 'unhide', 'view')),
  user_id    TEXT NOT NULL,
  username   TEXT NOT NULL,
  email      TEXT NOT NULL,
  detail     TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO admin_audit_log_new (id, action, user_id, username, email, detail, created_at)
  SELECT id, action, user_id, username, email, detail, created_at FROM admin_audit_log;
DROP TABLE admin_audit_log;
ALTER TABLE admin_audit_log_new RENAME TO admin_audit_log;
CREATE INDEX admin_audit_log_created_at ON admin_audit_log (created_at);
