-- The angle where the hardest move is: the base of the Strengths / Weaknesses report (#1523).
ALTER TABLE entries ADD COLUMN wall_angle TEXT
  CHECK (wall_angle IN ('slab', 'vert', 'overhang', 'roof', 'chimney', 'dihedral'));
