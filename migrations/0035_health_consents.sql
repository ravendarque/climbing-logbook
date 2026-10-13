-- One row per grant, kept after withdrawal as the record of consent (#1120).
CREATE TABLE consents (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  purpose         TEXT NOT NULL,
  wording_version TEXT NOT NULL,
  granted_at      TEXT NOT NULL,
  superseded_at   TEXT,
  withdrawn_at    TEXT
);
CREATE UNIQUE INDEX consents_one_current ON consents (user_id, purpose)
  WHERE superseded_at IS NULL AND withdrawn_at IS NULL;

-- Demo personas are fictional, so they're consented wherever they already exist (#1114).
INSERT INTO consents (id, user_id, purpose, wording_version, granted_at)
  SELECT 'demo-consent-' || user_id, user_id, 'pain_injury', '2026-10-13', datetime('now') FROM settings WHERE is_demo = 1;
