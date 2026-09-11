// Grade ordering, coloring, and per-discipline grade lists used by entry
// filtering/sorting, rendering, and the Grade Pyramid. Extracted from
// client/main.js (#206) -- first pure-logic module pulled out of the
// former inline script.

// #702 -- the canonical ordinal. One shared, discipline-agnostic formula:
// every number 1-9 takes the full combination of an optional letter (a-c)
// and an optional modifier (+/-), independently -- confirmed with Raven
// 2026-09-11 against real guidebooks (Jingo Wobbly uses "-" for Font in
// the wild), not just the two verified real scales (Font-extended, FFME)
// this was originally derived from. No per-discipline parameters --
// Boulder and Sport each interpret this same numbering as their own
// separate ordinal space (never cross-compared, same as #461's
// BOULDER_RANK/LEAD_RANK split), but the formula computing a position
// within one number is identical for both.
//
// Sub-position order within one number, corrected 2026-09-11 per Raven's
// own worked example (three real climbs logged as "2", "2+", and "2a+"
// must sort as 2 < 2a+ < 2+): bare "-"/plain sit at the very bottom
// (Raven's earlier "bare sits at the bottom" call, unchanged) -- but bare
// "+" moves to the very TOP of the number's range instead of sitting
// right after plain. "+" on a bare number reads as "the strong edge of
// this number, bordering the next one," the same intuition "+" already
// carries everywhere else in this matrix (UIAA/Norwegian's own -/plain/+
// triads, French's a+/b+/c+). An explicit ordered list, not a derived
// formula -- once "+" moves out of sequence for the no-letter case
// specifically, the ordering isn't a clean arithmetic function of
// (letterSlot, modifierSlot) anymore, so spelling out the 12 positions
// directly is clearer (and less error-prone) than a formula hiding a
// special case.
const SUB_POSITION_ORDER = [
  [null, "-"], [null, null],
  ["a", "-"], ["a", null], ["a", "+"],
  ["b", "-"], ["b", null], ["b", "+"],
  ["c", "-"], ["c", null], ["c", "+"],
  [null, "+"],
];
const SUB_POSITION_INDEX = new Map(
  SUB_POSITION_ORDER.map(([letter, modifier], i) => [`${letter ?? null}|${modifier ?? null}`, i])
);
export function nonStandardOrdinal(number, letter, modifier) {
  const key = `${letter ?? null}|${modifier ?? null}`;
  const subPosition = SUB_POSITION_INDEX.get(key);
  if (subPosition === undefined) return null;
  return (number - 1) * 12 + subPosition;
}

export function nonStandardLabel(number, letter, modifier) {
  return `${number}${letter ?? ""}${modifier ?? ""}`;
}

// Strict shape: one digit 1-9, optional single lowercase letter a-c,
// optional trailing +/-. Case-insensitive on input (real logged text may
// be uppercase); always normalizes letter to lowercase, matching
// nonStandardLabel()'s own output so toOrdinal(toLabel(x)) round-trips.
const NON_STANDARD_RE = /^([1-9])([abc])?([+-])?$/i;
export function parseNonStandardLabel(label) {
  const m = NON_STANDARD_RE.exec(String(label).trim());
  if (!m) return null;
  return {
    number: Number(m[1]),
    letter: m[2] ? m[2].toLowerCase() : null,
    modifier: m[3] ?? null,
  };
}

function makeNonStandardScale(id, discipline) {
  return {
    id,
    discipline,
    toOrdinal(label) {
      const parsed = parseNonStandardLabel(label);
      return parsed ? nonStandardOrdinal(parsed.number, parsed.letter, parsed.modifier) : null;
    },
    toLabel(ordinal) {
      const number = Math.floor(ordinal / 12) + 1;
      const withinNumber = ordinal - (number - 1) * 12;
      const [letter, modifier] = SUB_POSITION_ORDER[withinNumber];
      return nonStandardLabel(number, letter, modifier);
    },
  };
}

// #702 -- Font (Non-standard) and French (Non-standard): not lookup
// tables, real guidebooks use letters/modifiers inconsistently (the
// exact class of drift bug #698 found in a hand-maintained list can't
// recur here since there's no list at all, just the shared formula
// above). Both delegate to the identical function -- per Raven's
// explicit call, there are no per-discipline parameters left; the only
// difference between the two is `id`/`discipline`.
export const FONT_NON_STANDARD = makeNonStandardScale("font-non-standard", "boulder");
export const FRENCH_NON_STANDARD = makeNonStandardScale("french-non-standard", "sport");

// #702 -- Font-standard and French-standard both decompose exactly
// through the same number+letter+modifier shape parseNonStandardLabel
// already parses -- neither real table ever uses "-", and French's 1/2
// simply have no letter (parseNonStandardLabel already treats a missing
// letter as valid). Built from the literal, already-verified label lists
// (spec "The eight -- now nine -- scales"), not re-typed as raw
// ordinals -- one source of truth per scale, same "derive, don't
// hand-duplicate" fix this whole rework exists to make (the #698
// BOULDER_ORDER drift bug was exactly two hand-kept lists of the same
// data going out of sync).
function makeParsedScale(id, discipline, labels) {
  const byLabel = new Map();
  const byOrdinal = new Map();
  for (const label of labels) {
    const parsed = parseNonStandardLabel(label);
    if (!parsed) throw new Error(`${id}: "${label}" doesn't parse as number+letter+modifier`);
    const ordinal = nonStandardOrdinal(parsed.number, parsed.letter, parsed.modifier);
    byLabel.set(label.toLowerCase(), ordinal);
    byOrdinal.set(ordinal, label);
  }
  return {
    id,
    discipline,
    toOrdinal(label) { return byLabel.get(String(label).toLowerCase()) ?? null; },
    toLabel(ordinal) { return byOrdinal.get(ordinal) ?? null; },
  };
}

const FONT_STANDARD_LABELS = [
  "3","3+","4","4+","5","5+","6A","6A+","6B","6B+","6C","6C+",
  "7A","7A+","7B","7B+","7C","7C+","8A","8A+","8B","8B+","8C","8C+","9A",
];
export const FONT_STANDARD = makeParsedScale("font", "boulder", FONT_STANDARD_LABELS);

const FRENCH_STANDARD_LABELS = [
  "1","2","3a","3b","3c","4a","4b","4c","5a","5a+","5b","5b+","5c","5c+",
  "6a","6a+","6b","6b+","6c","6c+","7a","7a+","7b","7b+","7c","7c+",
  "8a","8a+","8b","8b+","8c","8c+","9a","9a+","9b","9b+","9c","9c+",
];
export const FRENCH_STANDARD = makeParsedScale("french", "sport", FRENCH_STANDARD_LABELS);

// #702 -- V-scale doesn't decompose through the number/letter/modifier
// shape at all (VB/V0-/V0/V0+/V1... isn't that pattern) -- an explicit
// anchor table against FONT_STANDARD's own ordinals instead, using the
// corrected hakaru.io-sourced correspondence (the spec's first draft had
// this wrong: 6A=V0, which no real chart shows). V3/V4/V5/V8 are
// genuinely 2-wide (map to two Font ordinals) -- everything else is 1:1.
const V_SCALE_TO_FONT = {
  "vb": "3", "v0-": "3+", "v0": "4", "v0+": "4+", "v1": "5", "v2": "5+",
  "v3": "6A", "v4": "6B", "v5": "6C", "v6": "7A", "v7": "7A+",
  "v8": "7B", "v9": "7C", "v10": "7C+", "v11": "8A", "v12": "8A+",
  "v13": "8B", "v14": "8B+", "v15": "8C", "v16": "8C+", "v17": "9A",
};
// The upper bound of each V-scale step's range, for 2-wide steps -- used
// only if a future consumer needs the "upper" edge (C's cross-scale
// rendering); toOrdinal() below always resolves the LOWER edge on input,
// per Raven's "no true middle of a 2-wide range" ruling.
const V_SCALE_UPPER = { v3: "6A+", v4: "6B+", v5: "6C+", v8: "7B+" };
export const V_SCALE = {
  id: "v-scale",
  discipline: "boulder",
  toOrdinal(label) {
    const font = V_SCALE_TO_FONT[String(label).toLowerCase()];
    return font ? FONT_STANDARD.toOrdinal(font) : null;
  },
  toLabel(ordinal) {
    // Reverse lookup: find the V-scale key whose Font ordinal (or, for a
    // 2-wide step, whose UPPER Font ordinal) is the smallest one >=
    // `ordinal` -- i.e. which V-scale bucket this canonical ordinal falls
    // into. Table is small (21 entries); linear scan is fine.
    const entries = Object.entries(V_SCALE_TO_FONT);
    for (const [vKey, fontLabel] of entries) {
      const upperLabel = V_SCALE_UPPER[vKey] ?? fontLabel;
      if (ordinal <= FONT_STANDARD.toOrdinal(upperLabel)) return vKey.toUpperCase();
    }
    return entries[entries.length - 1][0].toUpperCase();
  },
};

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
// orders MUST stay a superset of their own discipline's full current
// picker range, or a picker grade would fall straight back into the
// `?? 99` fallback this file was fixed to avoid. (These are still hand-
// maintained separately from BOULDER_GRADES/LEAD_GRADES -- #698 caught
// that drift: 3A-4C were added to the Boulder picker by #129 but not
// here, so every one of those six grades mis-ranked as 99. Worth
// deriving these from the picker lists + a couple of explicit
// out-of-picker extras in a future cleanup.)
const BOULDER_ORDER = [
  "1","1+","1A","1B","1C","2","2+","2A","2B","2C",
  "3","3+","3A","3B","3C","4","4+","4A","4B","4C",
  "5","5+","5A","5A+","5B","5B+","5C",
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
// same V-count-up pattern (V15/V16/V17). No per-grade colour field
// anymore -- #463 moved colouring onto gradeColor()/gradeTier() below,
// which needs only `type`, not a per-grade lookup table.
export const BOULDER_GRADES = [
  { g: "1",   v: "VB" },
  { g: "1+",  v: "VB" },
  { g: "1A",  v: "VB" },
  { g: "1B",  v: "VB" },
  { g: "1C",  v: "VB" },
  { g: "2",   v: "VB" },
  { g: "2+",  v: "VB" },
  { g: "2A",  v: "VB" },
  { g: "2B",  v: "VB" },
  { g: "2C",  v: "VB" },
  { g: "3",   v: "VB" },
  { g: "3+",  v: "VB" },
  { g: "3A",  v: "VB" },
  { g: "3B",  v: "VB" },
  { g: "3C",  v: "VB" },
  { g: "4",   v: "VB" },
  { g: "4+",  v: "VB" },
  { g: "4A",  v: "VB" },
  { g: "4B",  v: "VB" },
  { g: "4C",  v: "VB" },
  { g: "5",   v: "V0" },
  { g: "5+",  v: "V0" },
  { g: "5A",  v: "V0" },
  { g: "5B",  v: "V1" },
  { g: "5C",  v: "V2" },
  { g: "6A",  v: "V3" },
  { g: "6A+", v: "V3" },
  { g: "6B",  v: "V4" },
  { g: "6B+", v: "V4" },
  { g: "6C",  v: "V5" },
  { g: "6C+", v: "V5" },
  { g: "7A",  v: "V6" },
  { g: "7A+", v: "V7" },
  { g: "7B",  v: "V8" },
  { g: "7B+", v: "V8" },
  { g: "7C",  v: "V9" },
  { g: "7C+", v: "V10" },
  { g: "8A",  v: "V11" },
  { g: "8A+", v: "V12" },
  { g: "8B",  v: "V13" },
  { g: "8B+", v: "V14" },
  { g: "8C",  v: "V15" },
  { g: "8C+", v: "V16" },
  { g: "9A",  v: "V17" },
];
// #129 -- extended down to French `1` and up to `9c+`. Low end (1-5b)
// uses the scale's own standard progression (letters start at 4, per
// the real French system -- no equivalent to Boulder's 5/5A ambiguity
// here, so no parallel notation decision was needed).
export const LEAD_GRADES = [
  { g: "1" }, { g: "1+" }, { g: "2" }, { g: "2+" }, { g: "3" }, { g: "3+" },
  { g: "4a" }, { g: "4b" }, { g: "4c" }, { g: "5a" }, { g: "5b" }, { g: "5c" },
  { g: "6a" }, { g: "6a+" }, { g: "6b" }, { g: "6b+" }, { g: "6c" }, { g: "6c+" },
  { g: "7a" }, { g: "7a+" }, { g: "7b" }, { g: "7b+" }, { g: "7c" }, { g: "7c+" },
  { g: "8a" }, { g: "8a+" }, { g: "8b" }, { g: "8b+" }, { g: "8c" }, { g: "8c+" },
  { g: "9a" }, { g: "9a+" }, { g: "9b" }, { g: "9b+" }, { g: "9c" }, { g: "9c+" },
];

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

// #463 -- five colours picked from #170's own decided "Fiery Red Sunset"
// palette (see public/logbook/components/climbing-header.js's own
// --grade-tier-* tokens for the real hex values and the reasoning
// behind which five were picked). One shared mapping across both
// disciplines -- a tier name means the same thing regardless of which
// discipline produced it, so there's exactly one colour per tier, not
// two independent sets that happen to agree.
const GRADE_TIER_COLORS = {
  beginner: "var(--grade-tier-beginner)",
  intermediate: "var(--grade-tier-intermediate)",
  advanced: "var(--grade-tier-advanced)",
  elite: "var(--grade-tier-elite)",
  "hyper-elite": "var(--grade-tier-hyper-elite)",
};

// #463 -- replaces the old per-grade curated-colour lookup (a `c` field
// on every BOULDER_GRADES/LEAD_GRADES entry, plus a fractional-banding
// fallback for anything outside the current picker range) with tier-
// based colouring throughout. gradeTier() already resolves *any* grade
// via gradeRank() -- in-picker or not -- to one of five tiers, so the
// separate fallback-banding math the old implementation needed for
// out-of-range grades isn't needed here at all; every grade just goes
// through the same one path.
export function gradeColor(g, type) {
  return GRADE_TIER_COLORS[gradeTier(g, type)];
}

// #698 -- the Grade Pyramid's 8-4-2-1 window is only ~4 grades wide and
// spans at most two tiers, often just one, so gradeColor()'s flat
// per-tier colour would leave every bar the same. This walks the full
// 10-colour "Fiery Red Sunset" palette (the same one --grade-tier-*
// above picks five of) continuously by grade rank, so every grade in
// the window gets a distinct, monotonic shade in the warm red->gold
// family. Continuous rather than a discrete "2-3 steps per tier":
// tiers vary in width (Intermediate is 6 grades, Elite is 4), so a
// fixed per-tier sub-palette differentiates unevenly depending where
// the window lands -- interpolating by rank guarantees adjacent bars
// always differ. Only the pyramid uses this; every other view shows
// enough grades at once that gradeColor()'s tier banding reads fine.
const FIERY_RED_SUNSET = [
  "#03071e", "#370617", "#6a040f", "#9d0208", "#d00000",
  "#dc2f02", "#e85d04", "#f48c06", "#faa307", "#ffba08",
];
export function gradePyramidColor(g, type) {
  const resolvedType = type ?? "boulder";
  // Normalised against the discipline's real picker range (BOULDER_GRADES/
  // LEAD_GRADES), not BOULDER_ORDER/LEAD_ORDER's defensive superset -- the
  // pyramid only ever shows grades from within the picker, so its top
  // grade should map to the palette's brightest end exactly.
  const list = resolvedType === "boulder" ? BOULDER_GRADES : LEAD_GRADES;
  const maxRank = gradeRank(list[list.length - 1].g, resolvedType);
  const frac = Math.min(1, Math.max(0, gradeRank(g, resolvedType) / maxRank));
  const pos = frac * (FIERY_RED_SUNSET.length - 1);
  const lo = Math.floor(pos);
  if (pos === lo) return FIERY_RED_SUNSET[lo]; // lands exactly on a palette stop
  const hi = lo + 1;
  const loPct = Math.round((hi - pos) * 100);
  return `color-mix(in srgb, ${FIERY_RED_SUNSET[lo]} ${loPct}%, ${FIERY_RED_SUNSET[hi]})`;
}
