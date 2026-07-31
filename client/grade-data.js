// Grade ordering, coloring, and per-discipline grade lists used by entry
// filtering/sorting, rendering, and the Grade Pyramid. Extracted from
// client/main.js (#206) -- first pure-logic module pulled out of the
// former inline script.

const GRADE_ORDER = [
  "3","3+","4","4+","5","5+","5A","5A+","5B","5B+","5C",
  "6A","6A+","6B","6B+","6C","6C+",
  "7A","7A+","7B","7B+","7C","7C+",
  "8A","8A+","8B","8B+","8C","8C+",
  "9A","9A+"
];
const GRADE_RANK = Object.fromEntries(GRADE_ORDER.map((g, i) => [g.toUpperCase(), i]));

export function gradeRank(g) { return GRADE_RANK[g.toUpperCase()] ?? 99; }

export const BOULDER_GRADES = [
  { g: "5",   v: "V0",  c: "var(--grade-easy)" },
  { g: "5+",  v: "V0",  c: "var(--grade-easy)" },
  { g: "5A",  v: "V0",  c: "var(--grade-easy)" },
  { g: "5B",  v: "V1",  c: "var(--grade-easy)" },
  { g: "5C",  v: "V2",  c: "var(--grade-easy)" },
  { g: "6A",  v: "V3",  c: "var(--grade-6a)"   },
  { g: "6A+", v: "V3",  c: "var(--grade-6a)"   },
  { g: "6B",  v: "V4",  c: "var(--grade-6b)"   },
  { g: "6B+", v: "V4",  c: "var(--grade-6b)"   },
  { g: "6C",  v: "V5",  c: "var(--grade-6c)"   },
  { g: "6C+", v: "V5",  c: "var(--grade-6c)"   },
  { g: "7A",  v: "V6",  c: "var(--grade-7a)"   },
  { g: "7A+", v: "V7",  c: "var(--grade-7a)"   },
  { g: "7B",  v: "V8",  c: "var(--grade-7b)"   },
  { g: "7B+", v: "V8",  c: "var(--grade-7b)"   },
  { g: "7C",  v: "V9",  c: "var(--grade-7c)"   },
  { g: "7C+", v: "V10", c: "var(--grade-7c)"   },
  { g: "8A",  v: "V11", c: "var(--grade-8a)"   },
  { g: "8A+", v: "V12", c: "var(--grade-8a)"   },
  { g: "8B",  v: "V13", c: "var(--grade-8a)"   },
  { g: "8B+", v: "V14", c: "var(--grade-8a)"   },
];
export const LEAD_GRADES = [
  { g: "5c",  c: "var(--grade-easy)" },
  { g: "6a",  c: "var(--grade-6a)"   },
  { g: "6a+", c: "var(--grade-6a)"   },
  { g: "6b",  c: "var(--grade-6b)"   },
  { g: "6b+", c: "var(--grade-6b)"   },
  { g: "6c",  c: "var(--grade-6c)"   },
  { g: "6c+", c: "var(--grade-6c)"   },
  { g: "7a",  c: "var(--grade-7a)"   },
  { g: "7a+", c: "var(--grade-7a)"   },
  { g: "7b",  c: "var(--grade-7b)"   },
  { g: "7b+", c: "var(--grade-7b)"   },
  { g: "7c",  c: "var(--grade-7c)"   },
  { g: "7c+", c: "var(--grade-7c)"   },
  { g: "8a",  c: "var(--grade-8a)"   },
];

const GRADE_COLOR_BANDS = [
  "var(--grade-easy)", "var(--grade-6a)", "var(--grade-6b)", "var(--grade-6c)",
  "var(--grade-7a)",   "var(--grade-7b)", "var(--grade-7c)", "var(--grade-8a)",
];
// BOULDER_GRADES/LEAD_GRADES already carry a curated `c` per entry -- look
// those up directly rather than re-deriving a color from rank. Lead's list
// is only 14 entries against Boulder's 21, so applying one set of absolute
// rank thresholds to both compressed most of Lead's range into a couple of
// bands (#109); per-discipline lookup sidesteps that instead of just
// recalibrating the thresholds.
export function gradeColor(g, type) {
  const list = type === "lead" ? LEAD_GRADES : BOULDER_GRADES;
  const hit = list.find(x => x.g.toUpperCase() === String(g).toUpperCase());
  if (hit) return hit.c;

  // Grades outside the current picker range (e.g. pre-#60 sub-5 boulder
  // entries) have no curated color -- band by fraction of this
  // discipline's own rank span so a short list still spreads across
  // the full band range instead of bunching up.
  const minR = gradeRank(list[0].g);
  const maxR = gradeRank(list[list.length - 1].g);
  const frac = (gradeRank(g) - minR) / (maxR - minR);
  const idx = Math.min(GRADE_COLOR_BANDS.length - 1, Math.max(0, Math.floor(frac * GRADE_COLOR_BANDS.length)));
  return GRADE_COLOR_BANDS[idx];
}
