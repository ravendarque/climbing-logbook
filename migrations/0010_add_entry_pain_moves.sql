-- Move-level pain/injury tagging (#572, epic #5 Phase 1) -- gates #39
-- (injury/pain log). Sole pain-tracking mechanism: there is no flat
-- entries.pain_flag column (was #564, closed 2026-08-28, superseded by
-- this table) -- zero rows means no pain logged, one or more means yes,
-- the row count *is* the flag.
--
-- Shares entry_moves' limb/hold_type/movement_style/wall_angle taxonomy
-- (same CHECK shape) but is explicitly its own table, not a `pain`
-- column added to entry_moves -- that was considered and rejected,
-- since it would imply pain is a property of being tagged
-- hardest/easiest, which isn't true (a move can hurt without being
-- anyone's hardest or easiest move of the climb). No difficulty column
-- here -- this table has no hardest/easiest concept, only "did this
-- move hurt."
CREATE TABLE entry_pain_moves (
  id             TEXT PRIMARY KEY,
  entry_id       TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  limb           TEXT NOT NULL CHECK (limb IN ('hand','foot','knee')),
  side           TEXT NOT NULL CHECK (side IN ('left','right')),
  hold_type      TEXT NOT NULL,
  movement_style TEXT NOT NULL CHECK (
                   (limb = 'hand' AND movement_style IN ('static','dynamic','lockoff'))
                OR (limb != 'hand' AND movement_style IN ('static','dynamic'))
                 ),
  wall_angle     TEXT NOT NULL CHECK (wall_angle IN ('slab','vert','overhang','roof')),
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_entry_pain_moves_entry_id ON entry_pain_moves(entry_id);
