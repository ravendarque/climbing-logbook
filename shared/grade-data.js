// Grade ordering, coloring, and per-discipline grade lists used by entry
// filtering/sorting, rendering, and the Grade Pyramid. Extracted from
// client/main.js (#206) -- first pure-logic module pulled out of the
// former inline script.

// #461 -- gradeRank() used to share ONE flat, Boulder-only order across
// both disciplines: every caller (gap-stats.js, effort-stats.js,
// volume-stats.js, client/entries.js) called it directly on raw entry
// grades, boulder or sport alike, and it "worked" for Sport only by
// coincidence -- Sport's a/b/c notation happened to collide with a
// Boulder substring in the old list that sorted the same direction.
// #129's own low/high-end extension (Sport grades like "4a"/"9c+" that
// don't exist in Boulder's notation at all) exposed this: those grades
// fell through to the `?? 99` fallback, tying every one of them at
// "harder than everything." Real per-discipline order now.
//
// Each list is deliberately WIDER than its own current picker
// (BOULDER_GRADES/LEAD_GRADES below) -- same reasoning the original
// Boulder list already followed for pre-#60 sub-picker historical
// entries (a grade a user logged before the picker's range was what it
// is today still needs a real rank, not the fallback). Applied to Sport
// for the first time here, defensively, since the same kind of
// historical/out-of-picker entry could exist for Sport too.
const BOULDER_ORDER = [
  "3","3+","4","4+","5","5+","5A","5A+","5B","5B+","5C",
  "6A","6A+","6B","6B+","6C","6C+",
  "7A","7A+","7B","7B+","7C","7C+",
  "8A","8A+","8B","8B+","8C","8C+",
  "9A","9A+"
];
const LEAD_ORDER = [
  "1","1+","2","2+","3","3+","4A","4B","4C","5A","5B",
  "5C","6A","6A+","6B","6B+","6C","6C+",
  "7A","7A+","7B","7B+","7C","7C+",
  "8A","8A+","8B"
];
const BOULDER_RANK = Object.fromEntries(BOULDER_ORDER.map((g, i) => [g, i]));
const LEAD_RANK = Object.fromEntries(LEAD_ORDER.map((g, i) => [g, i]));

// `type` defaults to "boulder", matching gradeColor()'s own documented
// default (and every other type-defaulting function in this file) --
// an omitted type is never silently routed to whichever discipline
// happened to be checked first.
export function gradeRank(g, type) {
  const rank = (type ?? "boulder") === "boulder" ? BOULDER_RANK : LEAD_RANK;
  return rank[String(g).toUpperCase()] ?? 99;
}

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
// #430/#649 -- was `type === "lead" ? LEAD_GRADES : BOULDER_GRADES`: that
// direction silently mis-colored anything that wasn't literally "boulder"
// or "lead" as boulder (found while adding "sport" -- a Sport entry's
// grade would have looked up BOULDER_GRADES's colors instead of the
// shared boulder/lead-style scale it actually uses). `type ?? "boulder"`
// preserves the documented "omitted type defaults to boulder" behavior
// (test/shared/grade-data.test.js's own case) while routing every other
// non-boulder value -- "lead", "sport", and whatever comes after either
// -- to LEAD_GRADES, matching entry-form.js's own grade-list ternary
// (`store.getActiveType() === "boulder" ? BOULDER_GRADES : LEAD_GRADES`).
export function gradeColor(g, type) {
  const resolvedType = type ?? "boulder";
  const list = resolvedType === "boulder" ? BOULDER_GRADES : LEAD_GRADES;
  const hit = list.find(x => x.g.toUpperCase() === String(g).toUpperCase());
  if (hit) return hit.c;

  // Grades outside the current picker range (e.g. pre-#60 sub-5 boulder
  // entries) have no curated color -- band by fraction of this
  // discipline's own rank span so a short list still spreads across
  // the full band range instead of bunching up.
  const minR = gradeRank(list[0].g, resolvedType);
  const maxR = gradeRank(list[list.length - 1].g, resolvedType);
  const frac = (gradeRank(g, resolvedType) - minR) / (maxR - minR);
  const idx = Math.min(GRADE_COLOR_BANDS.length - 1, Math.max(0, Math.floor(frac * GRADE_COLOR_BANDS.length)));
  return GRADE_COLOR_BANDS[idx];
}
