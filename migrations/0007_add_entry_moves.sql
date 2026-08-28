-- Move-level hardest/easiest tagging for #13's strengths/weaknesses
-- breakdown (#36, epic #5 Phase 1). A climb can mix hold types and wall
-- angles across its length, so the signal #13 needs lives at the level
-- of individual moves within an entry, not the entry as a whole -- see
-- docs/superpowers/specs/2026-08-27-performance-insights-ui-design.md
-- for the full design and taxonomy reasoning.
--
-- Zero-to-many rows per entry, entirely optional. difficulty buckets a
-- row into "hardest" or "easiest" (one table, not two parallel ones --
-- same row shape either way). hold_type's valid set depends on limb
-- (hand vs. foot/knee use different vocabularies) -- validated
-- app-level once Phase 2 wires the API, same treatment entries.grade
-- already gets (too limb-dependent for a flat CHECK). The
-- movement_style CHECK below enforces the one cross-column rule the
-- taxonomy actually has: lockoff is a hand-only movement style.
CREATE TABLE entry_moves (
  id             TEXT PRIMARY KEY,
  entry_id       TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  difficulty     TEXT NOT NULL CHECK (difficulty IN ('hardest','easiest')),
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
CREATE INDEX idx_entry_moves_entry_id ON entry_moves(entry_id);
