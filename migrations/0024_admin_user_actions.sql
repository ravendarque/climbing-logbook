CREATE TABLE account_suspensions (
  user_id      TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  suspended_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE banned_identities (
  kind      TEXT NOT NULL CHECK (kind IN ('email', 'username')),
  value     TEXT NOT NULL,
  banned_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (kind, value)
);

-- No foreign key: an entry outlives the account it's about.
CREATE TABLE admin_audit_log (
  id         TEXT PRIMARY KEY,
  action     TEXT NOT NULL CHECK (action IN ('suspend', 'unsuspend', 'delete', 'ban')),
  user_id    TEXT NOT NULL,
  username   TEXT NOT NULL,
  email      TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX admin_audit_log_created_at ON admin_audit_log (created_at);
