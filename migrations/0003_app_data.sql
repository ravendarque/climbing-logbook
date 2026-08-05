-- Normalized D1 schema for app data (#21, part of #8's multi-tenant epic).
-- Replaces the single KV blob per resource type (`logbook:entries` etc.) --
-- fine for one user, not viable for per-user isolation. `disciplines`/
-- `statuses` are lookup tables (not `TEXT CHECK (...)`) so a new discipline
-- is an INSERT, not a migration -- natural TEXT keys match the slugs
-- already used across the client/API (grade-data.js, status.js), so the
-- JSON wire format ("type": "boulder") is unchanged; the resource-handler
-- layer (#297) maps the JSON field to the FK column internally.
--
-- Every 0/1 flag is declared BOOLEAN (self-documenting -- D1/SQLite has no
-- true boolean type, even BOOLEAN is INTEGER affinity underneath) with a
-- CHECK (col IN (0,1)) that's what's actually enforced.

CREATE TABLE disciplines (
  id   TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE statuses (
  id   TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

INSERT INTO disciplines (id, name) VALUES
  ('boulder', 'Boulder'),
  ('lead', 'Lead');

INSERT INTO statuses (id, name) VALUES
  ('send', 'Send'),
  ('project', 'Project'),
  ('abandoned', 'Abandoned'),
  ('wishlist', 'Wishlist');

CREATE TABLE locations (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  country    TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_locations_user_id ON locations(user_id);

CREATE TABLE places (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  location_id TEXT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  area        TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_places_user_id     ON places(user_id);
CREATE INDEX idx_places_location_id ON places(location_id);

CREATE TABLE entries (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  place_id      TEXT NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  -- app-level validated, not a FK/CHECK -- valid set depends on
  -- discipline_id (boulder vs lead grades differ), and is the one field
  -- plausible to change often.
  grade         TEXT NOT NULL,
  discipline_id TEXT NOT NULL REFERENCES disciplines(id),
  status_id     TEXT NOT NULL REFERENCES statuses(id),
  first_attempt BOOLEAN NOT NULL DEFAULT 0 CHECK (first_attempt IN (0,1)),
  -- app-level validated (YYYY[-MM[-DD]])
  date          TEXT,
  -- app-level validated (URL scheme)
  video         TEXT,
  notes         TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_entries_user_id       ON entries(user_id);
CREATE INDEX idx_entries_place_id      ON entries(place_id);
CREATE INDEX idx_entries_discipline_id ON entries(discipline_id);

CREATE TABLE settings (
  user_id           TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,
  athlete_mode      BOOLEAN NOT NULL DEFAULT 0 CHECK (athlete_mode IN (0,1)),
  active_discipline TEXT NOT NULL DEFAULT 'boulder' REFERENCES disciplines(id),
  -- New signups are public by default, matching the product's real
  -- identity: public logbook data, private performance data (Grade
  -- Pyramid stays owner-only always, see #8's decisions). The settings-UI
  -- to let a user flip this after signup is #301, a separate deferred
  -- issue -- this column and its default just need to exist so #113's
  -- per-user routing has something to check.
  logbook_public    BOOLEAN NOT NULL DEFAULT 1 CHECK (logbook_public IN (0,1)),
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
