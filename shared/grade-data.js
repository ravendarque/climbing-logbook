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
// #129 -- extended alongside BOULDER_GRADES/LEAD_GRADES below: both
// orders need to keep covering at least their own discipline's full
// current picker range, or a newly-added grade would fall straight
// back into the `?? 99` fallback this file was just fixed to avoid.
const BOULDER_ORDER = [
  "1","1+","1A","1B","1C","2","2+","2A","2B","2C",
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
  "8A","8A+","8B","8B+","8C","8C+",
  "9A","9A+","9B","9B+","9C","9C+"
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

// #129 -- extended down to 1/1A and up to 9A. Bottom end (1-4) mirrors
// the existing 5/5+/5A/5B/5C shape at every tier -- both notations
// (bare number and lettered) coexist as genuinely distinct picker
// entries, same pattern 5 already established, not a new one invented
// for the extension. `v` (V-scale label): everything below the existing
// V0 threshold is `VB`, not a reused V0 -- V0 is the real cutoff (`5`/
// `5+`/`5A`), so extending the range downward can't also silently
// relabel what V0 already means. New top end (8C/8C+/9A) continues the
// same V-count-up pattern (V15/V16/V17) and reuses the existing top
// colour band (`--grade-8a`) rather than inventing a new token for
// three more grades -- #689's own grade-tier colour redesign will
// replace this whole per-grade colour scheme soon anyway.
export const BOULDER_GRADES = [
  { g: "1",   v: "VB",  c: "var(--grade-easy)" },
  { g: "1+",  v: "VB",  c: "var(--grade-easy)" },
  { g: "1A",  v: "VB",  c: "var(--grade-easy)" },
  { g: "1B",  v: "VB",  c: "var(--grade-easy)" },
  { g: "1C",  v: "VB",  c: "var(--grade-easy)" },
  { g: "2",   v: "VB",  c: "var(--grade-easy)" },
  { g: "2+",  v: "VB",  c: "var(--grade-easy)" },
  { g: "2A",  v: "VB",  c: "var(--grade-easy)" },
  { g: "2B",  v: "VB",  c: "var(--grade-easy)" },
  { g: "2C",  v: "VB",  c: "var(--grade-easy)" },
  { g: "3",   v: "VB",  c: "var(--grade-easy)" },
  { g: "3+",  v: "VB",  c: "var(--grade-easy)" },
  { g: "3A",  v: "VB",  c: "var(--grade-easy)" },
  { g: "3B",  v: "VB",  c: "var(--grade-easy)" },
  { g: "3C",  v: "VB",  c: "var(--grade-easy)" },
  { g: "4",   v: "VB",  c: "var(--grade-easy)" },
  { g: "4+",  v: "VB",  c: "var(--grade-easy)" },
  { g: "4A",  v: "VB",  c: "var(--grade-easy)" },
  { g: "4B",  v: "VB",  c: "var(--grade-easy)" },
  { g: "4C",  v: "VB",  c: "var(--grade-easy)" },
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
  { g: "8C",  v: "V15", c: "var(--grade-8a)"   },
  { g: "8C+", v: "V16", c: "var(--grade-8a)"   },
  { g: "9A",  v: "V17", c: "var(--grade-8a)"   },
];
// #129 -- extended down to French `1` and up to `9c+`. Low end (1-5b)
// uses the scale's own standard progression (letters start at 4, per
// the real French system -- no equivalent to Boulder's 5/5A ambiguity
// here, so no parallel notation decision was needed). New top end
// (8a+...9c+) reuses the existing top colour band, same reasoning as
// BOULDER_GRADES' own extension above.
export const LEAD_GRADES = [
  { g: "1",   c: "var(--grade-easy)" },
  { g: "1+",  c: "var(--grade-easy)" },
  { g: "2",   c: "var(--grade-easy)" },
  { g: "2+",  c: "var(--grade-easy)" },
  { g: "3",   c: "var(--grade-easy)" },
  { g: "3+",  c: "var(--grade-easy)" },
  { g: "4a",  c: "var(--grade-easy)" },
  { g: "4b",  c: "var(--grade-easy)" },
  { g: "4c",  c: "var(--grade-easy)" },
  { g: "5a",  c: "var(--grade-easy)" },
  { g: "5b",  c: "var(--grade-easy)" },
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
  { g: "8a+", c: "var(--grade-8a)"   },
  { g: "8b",  c: "var(--grade-8a)"   },
  { g: "8b+", c: "var(--grade-8a)"   },
  { g: "8c",  c: "var(--grade-8a)"   },
  { g: "8c+", c: "var(--grade-8a)"   },
  { g: "9a",  c: "var(--grade-8a)"   },
  { g: "9a+", c: "var(--grade-8a)"   },
  { g: "9b",  c: "var(--grade-8a)"   },
  { g: "9b+", c: "var(--grade-8a)"   },
  { g: "9c",  c: "var(--grade-8a)"   },
  { g: "9c+", c: "var(--grade-8a)"   },
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

// #462 -- five-tier headline classification, decided 2026-09-09 (see the
// issue for the full reasoning): Raven's own felt sense of each
// discipline's grade distribution, not a scientific equivalence -- and
// Boulder's boundaries applied verbatim to Sport (same letters/numbers,
// Sport's own lowercase notation), not derived from any cross-system
// conversion table (an earlier attempt at that badly misfired, see the
// issue). Deliberately narrower bands the higher the tier, cross-checked
// against Rockfax's 2020 grade-comparison posters and found to require
// *more* to reach each label than that now-dated reference does, by
// design -- climbing has gotten more competitive since 2020.
//
// Each entry is [tierName, thresholdGrade] in ascending order; `null`
// marks the bottom (no lower bound). The two disciplines never compare
// against each other -- each grade resolves against its own thresholds
// only, matching #461's own "no consumer needs true cross-discipline
// comparability yet" scoping.
const GRADE_TIER_THRESHOLDS = {
  boulder: [
    ["beginner", null],
    ["intermediate", "6A"],
    ["advanced", "7A"],
    ["elite", "7C+"],
    ["hyper-elite", "8B+"],
  ],
  sport: [
    ["beginner", null],
    ["intermediate", "6a"],
    ["advanced", "7a"],
    ["elite", "7c+"],
    ["hyper-elite", "8b+"],
  ],
};

// Purely the numeric classification -- no UI/naming/visual treatment
// here (#463 wires this into rendering; #689 is the still-open design
// conversation about how a tier actually looks). Returns one of
// "beginner"/"intermediate"/"advanced"/"elite"/"hyper-elite".
export function gradeTier(g, type) {
  const resolvedType = type ?? "boulder";
  const thresholds = GRADE_TIER_THRESHOLDS[resolvedType] ?? GRADE_TIER_THRESHOLDS.boulder;
  const r = gradeRank(g, resolvedType);
  let tier = thresholds[0][0];
  for (const [name, fromGrade] of thresholds) {
    if (fromGrade !== null && r >= gradeRank(fromGrade, resolvedType)) tier = name;
  }
  return tier;
}
