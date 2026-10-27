-- Free-text beta read by the beta interpreter replaces the hardest/easiest move rows (#1522).
ALTER TABLE entries ADD COLUMN hardest_beta TEXT;

CREATE TABLE entry_movements (
  id                 TEXT PRIMARY KEY,
  entry_id           TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  position           INTEGER NOT NULL,
  crux               INTEGER NOT NULL DEFAULT 0,
  terrain            TEXT NOT NULL,
  transition         TEXT,
  start_state        TEXT NOT NULL,
  end_state          TEXT NOT NULL,
  vocabulary_version TEXT NOT NULL,
  created_at         TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_entry_movements_entry_id ON entry_movements(entry_id);

-- The old move rows are no longer read, written or cleaned up, and none are worth keeping; the table goes in a later release.
DELETE FROM entry_moves;
