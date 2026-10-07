CREATE TABLE import_runs (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  entries    INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_import_runs_user_id ON import_runs(user_id);

-- When each usage figure started being recorded, so the dashboard can say "counted from".
CREATE TABLE usage_tracking (
  metric TEXT PRIMARY KEY,
  since  TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO usage_tracking (metric) VALUES ('imports');
