// Grade storage, ordinals, conversion and tiers: docs/grade-model.md.

// Bare + is the top of its number, so this is a list rather than a formula.
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

function makeNonStandardScale(id, discipline, name) {
  return {
    id,
    discipline,
    name,
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

export const FONT_NON_STANDARD = makeNonStandardScale("font-non-standard", "boulder", "Font (Non-standard)");
export const FRENCH_NON_STANDARD = makeNonStandardScale("french-non-standard", "sport", "French (Non-standard)");

// Ties round down: labelByOrdinal must be in ascending order.
function closestLabel(ordinal, labelByOrdinal) {
  if (labelByOrdinal.has(ordinal)) return labelByOrdinal.get(ordinal);
  let closest = null, closestDist = Infinity;
  for (const [o, l] of labelByOrdinal) {
    const d = Math.abs(o - ordinal);
    if (d < closestDist) { closest = l; closestDist = d; }
  }
  return closest;
}

// Within the same number only; null below the scale's range (no inflation).
function numberOfOrdinal(ordinal) {
  return Math.floor(ordinal / 12) + 1;
}
function closestParsedLabel(ordinal, byOrdinal) {
  if (byOrdinal.has(ordinal)) return byOrdinal.get(ordinal);
  const num = numberOfOrdinal(ordinal);
  const sameNumber = [...byOrdinal].filter(([o]) => numberOfOrdinal(o) === num);
  if (sameNumber.length === 0) return null;
  let closest = null, closestDist = Infinity;
  for (const [o, l] of sameNumber) {
    const d = Math.abs(o - ordinal);
    if (d < closestDist) { closest = l; closestDist = d; }
  }
  return closest;
}

function makeParsedScale(id, discipline, name, labels) {
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
    name,
    // A copy, so callers can't reorder the scale.
    labels: [...labels],
    toOrdinal(label) { return byLabel.get(String(label).toLowerCase()) ?? null; },
    toLabel(ordinal) { return closestParsedLabel(ordinal, byOrdinal); },
  };
}

const FONT_STANDARD_LABELS = [
  "3","3+","4","4+","5","5+","6A","6A+","6B","6B+","6C","6C+",
  "7A","7A+","7B","7B+","7C","7C+","8A","8A+","8B","8B+","8C","8C+","9A",
];
export const FONT_STANDARD = makeParsedScale("font", "boulder", "Font", FONT_STANDARD_LABELS);

const FRENCH_STANDARD_LABELS = [
  "1","2","3a","3b","3c","4a","4b","4c","5a","5a+","5b","5b+","5c","5c+",
  "6a","6a+","6b","6b+","6c","6c+","7a","7a+","7b","7b+","7c","7c+",
  "8a","8a+","8b","8b+","8c","8c+","9a","9a+","9b","9b+","9c","9c+",
];
export const FRENCH_STANDARD = makeParsedScale("french", "sport", "French", FRENCH_STANDARD_LABELS);

// Rockfax's chart. V3, V4, V5 and V8 each cover two Font grades.
const V_SCALE_TO_FONT = {
  "vb": "3", "v0-": "3+", "v0": "4", "v0+": "4+", "v1": "5", "v2": "5+",
  "v3": "6A", "v4": "6B", "v5": "6C", "v6": "7A", "v7": "7A+",
  "v8": "7B", "v9": "7C", "v10": "7C+", "v11": "8A", "v12": "8A+",
  "v13": "8B", "v14": "8B+", "v15": "8C", "v16": "8C+", "v17": "9A",
};
const V_SCALE_UPPER = { v3: "6A+", v4: "6B+", v5: "6C+", v8: "7B+" };
export const V_SCALE = {
  id: "v-scale",
  discipline: "boulder",
  name: "V-scale (Hueco)",
  labels: Object.keys(V_SCALE_TO_FONT).map(k => k.toUpperCase()),
  toOrdinal(label) {
    const font = V_SCALE_TO_FONT[String(label).toLowerCase()];
    return font ? FONT_STANDARD.toOrdinal(font) : null;
  },
  toLabel(ordinal) {
    const entries = Object.entries(V_SCALE_TO_FONT);
    for (const [vKey, fontLabel] of entries) {
      const upperLabel = V_SCALE_UPPER[vKey] ?? fontLabel;
      if (ordinal <= FONT_STANDARD.toOrdinal(upperLabel)) return vKey.toUpperCase();
    }
    return entries[entries.length - 1][0].toUpperCase();
  },
};

function makeAnchoredScale(id, name, labels, anchors) {
  const anchorIndex = new Map(anchors.map(a => [a.label, FRENCH_STANDARD.toOrdinal(a.frenchAnchor)]));
  const ordinalByLabel = new Map();
  let lastAnchorPos = -1, lastAnchorOrdinal = null;
  const anchoredPositions = labels
    .map((l, i) => (anchorIndex.has(l) ? i : -1))
    .filter(i => i !== -1);

  for (let i = 0; i < labels.length; i++) {
    const label = labels[i];
    if (anchorIndex.has(label)) {
      ordinalByLabel.set(label, anchorIndex.get(label));
      lastAnchorPos = i;
      lastAnchorOrdinal = anchorIndex.get(label);
      continue;
    }
    const nextAnchorPos = anchoredPositions.find(p => p > i);
    if (lastAnchorPos === -1) {
      // One anchor: fall back to one label per French step.
      const firstPos = anchoredPositions[0];
      const secondPos = anchoredPositions[1];
      const slope = secondPos === undefined ? 1
        : (anchorIndex.get(labels[secondPos]) - anchorIndex.get(labels[firstPos])) / (secondPos - firstPos);
      ordinalByLabel.set(label, Math.max(0, Math.round(anchorIndex.get(labels[firstPos]) - slope * (firstPos - i))));
      continue;
    }
    if (nextAnchorPos === undefined) {
      const lastTwo = anchoredPositions.slice(-2);
      const slope = lastTwo.length < 2 ? 1
        : (anchorIndex.get(labels[lastTwo[1]]) - anchorIndex.get(labels[lastTwo[0]])) / (lastTwo[1] - lastTwo[0]);
      ordinalByLabel.set(label, Math.round(lastAnchorOrdinal + slope * (i - lastAnchorPos)));
      continue;
    }
    const nextOrdinal = anchorIndex.get(labels[nextAnchorPos]);
    const t = (i - lastAnchorPos) / (nextAnchorPos - lastAnchorPos);
    ordinalByLabel.set(label, Math.round(lastAnchorOrdinal + t * (nextOrdinal - lastAnchorOrdinal)));
  }

  const labelByOrdinal = new Map();
  for (const [label, ordinal] of ordinalByLabel) if (!labelByOrdinal.has(ordinal)) labelByOrdinal.set(ordinal, label);

  const ordinalByLowerLabel = new Map([...ordinalByLabel].map(([l, o]) => [l.toLowerCase(), o]));

  return {
    id,
    discipline: "sport",
    name,
    labels: [...labels],
    toOrdinal(label) { return ordinalByLowerLabel.get(String(label).toLowerCase()) ?? null; },
    toLabel(ordinal) { return closestLabel(ordinal, labelByOrdinal); },
  };
}

const UIAA_LABELS = [
  "I","II","III-","III","III+","IV-","IV","IV+","V-","V","V+","VI-","VI","VI+",
  "VII-","VII","VII+","VIII-","VIII","VIII+","IX-","IX","IX+","X-","X","X+",
  "XI-","XI","XI+","XII-","XII","XII+",
];
const UIAA_ANCHORS = [
  { label: "VI+", frenchAnchor: "6a", source: "Wikipedia: Grade (climbing)" },
];
export const UIAA_SCALE = makeAnchoredScale("uiaa", "UIAA", UIAA_LABELS, UIAA_ANCHORS);

const YDS_LABELS = [
  "5.0","5.1","5.2","5.3","5.4","5.5","5.6","5.7","5.8","5.9",
  "5.10a","5.10b","5.10c","5.10d","5.11a","5.11b","5.11c","5.11d",
  "5.12a","5.12b","5.12c","5.12d","5.13a","5.13b","5.13c","5.13d",
  "5.14a","5.14b","5.14c","5.14d","5.15a","5.15b","5.15c","5.15d",
];
const YDS_ANCHORS = [
  { label: "5.10a", frenchAnchor: "6a", source: "Wikipedia: Grade (climbing)" },
];
export const YDS_SCALE = makeAnchoredScale("yds", "YDS", YDS_LABELS, YDS_ANCHORS);

const NORWEGIAN_LABELS = [
  "1","1+","2-","2","2+","3-","3","3+","4-","4","4+","5-","5","5+",
  "6-","6","6+","7-","7","7+","8-","8","8+","9-","9","9+","10-","10","10+","11-","11",
];
const NORWEGIAN_ANCHORS = [
  { label: "6-", frenchAnchor: "6a", source: "theCrag: Norwegian grade conversion" },
  { label: "9+", frenchAnchor: "8c", source: "theCrag: Norwegian grade conversion" },
];
export const NORWEGIAN_SCALE = makeAnchoredScale("norwegian", "Norwegian", NORWEGIAN_LABELS, NORWEGIAN_ANCHORS);

const EWBANK_LABELS = Array.from({ length: 40 }, (_, i) => String(i + 1));
const EWBANK_ANCHORS = [
  { label: "18", frenchAnchor: "6a", source: "Wikipedia: Grade (climbing)" },
];
export const EWBANK_SCALE = makeAnchoredScale("ewbank", "Australian (Ewbank)", EWBANK_LABELS, EWBANK_ANCHORS);

// Sourced anchors only: interpolated labels are not claims.
export const GRADE_CONVERSION_MATRIX = [
  ...UIAA_ANCHORS.map(a => ({ scaleId: "uiaa", ...a })),
  ...YDS_ANCHORS.map(a => ({ scaleId: "yds", ...a })),
  ...NORWEGIAN_ANCHORS.map(a => ({ scaleId: "norwegian", ...a })),
  ...EWBANK_ANCHORS.map(a => ({ scaleId: "ewbank", ...a })),
  { scaleId: "v-scale", label: "V9", frenchAnchor: "7c", source: "Rockfax: Bouldering Grade Table (2020)" },
];

export const SCALES = {
  [FONT_STANDARD.id]: FONT_STANDARD,
  [FONT_NON_STANDARD.id]: FONT_NON_STANDARD,
  [V_SCALE.id]: V_SCALE,
  [FRENCH_STANDARD.id]: FRENCH_STANDARD,
  [FRENCH_NON_STANDARD.id]: FRENCH_NON_STANDARD,
  [UIAA_SCALE.id]: UIAA_SCALE,
  [YDS_SCALE.id]: YDS_SCALE,
  [NORWEGIAN_SCALE.id]: NORWEGIAN_SCALE,
  [EWBANK_SCALE.id]: EWBANK_SCALE,
};
export const SCALES_BY_DISCIPLINE = {
  boulder: Object.values(SCALES).filter(s => s.discipline === "boulder"),
  sport: Object.values(SCALES).filter(s => s.discipline === "sport"),
};

// Enforced server-side too: the scale is a query parameter anyone can send.
export const STANDARD_SCALES_BY_DISCIPLINE = {
  boulder: SCALES_BY_DISCIPLINE.boulder.filter(s => s.id !== FONT_NON_STANDARD.id),
  sport: SCALES_BY_DISCIPLINE.sport.filter(s => s.id !== FRENCH_NON_STANDARD.id),
};

export function resolveScaleId(type, requested, fallback, scales = SCALES_BY_DISCIPLINE[type]) {
  const validIds = scales.map(s => s.id);
  return validIds.includes(requested) ? requested : fallback;
}

export const DEFAULT_SCALE_BY_TYPE = { boulder: "font", sport: "french" };

export function gradeOrdinal(grade, scaleId) {
  const scale = SCALES[scaleId];
  return scale ? scale.toOrdinal(grade) : null;
}

// Must stay supersets of the pickers' grade lists, or a picker grade ranks as unknown.
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

export function gradeRank(g, type) {
  const rank = (type ?? "boulder") === "boulder" ? BOULDER_RANK : LEAD_RANK;
  return rank[String(g).toUpperCase()] ?? 99;
}

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
export const LEAD_GRADES = [
  { g: "1" }, { g: "1+" }, { g: "2" }, { g: "2+" }, { g: "3" }, { g: "3+" },
  { g: "4a" }, { g: "4b" }, { g: "4c" }, { g: "5a" }, { g: "5b" }, { g: "5c" },
  { g: "6a" }, { g: "6a+" }, { g: "6b" }, { g: "6b+" }, { g: "6c" }, { g: "6c+" },
  { g: "7a" }, { g: "7a+" }, { g: "7b" }, { g: "7b+" }, { g: "7c" }, { g: "7c+" },
  { g: "8a" }, { g: "8a+" }, { g: "8b" }, { g: "8b+" }, { g: "8c" }, { g: "8c+" },
  { g: "9a" }, { g: "9a+" }, { g: "9b" }, { g: "9b+" }, { g: "9c" }, { g: "9c+" },
];

// Felt sense, narrowing towards the top; sport's upper bands differ from boulder's.
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
    ["advanced", "7a+"],
    ["elite", "8a+"],
    ["hyper-elite", "9a+"],
  ],
};

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

const GRADE_TIER_COLORS = {
  beginner: "var(--grade-tier-beginner)",
  intermediate: "var(--grade-tier-intermediate)",
  advanced: "var(--grade-tier-advanced)",
  elite: "var(--grade-tier-elite)",
  "hyper-elite": "var(--grade-tier-hyper-elite)",
};

export function gradeColor(g, type) {
  return GRADE_TIER_COLORS[gradeTier(g, type)];
}

export function gradeTierColor(tierId) {
  return GRADE_TIER_COLORS[tierId];
}

// The pyramid spans about four grades, so it interpolates the full palette to keep bars distinct.
const FIERY_RED_SUNSET = [
  "#03071e", "#370617", "#6a040f", "#9d0208", "#d00000",
  "#dc2f02", "#e85d04", "#f48c06", "#faa307", "#ffba08",
];

// Infinity, not 99: sport ordinals already pass 100.
export function gradeRankForScale(grade, scaleId, type) {
  return gradeOrdinal(grade, scaleId) ?? Infinity;
}

export function gradeTierForScale(grade, scaleId, type) {
  const resolvedType = type ?? "boulder";
  const thresholds = GRADE_TIER_THRESHOLDS[resolvedType] ?? GRADE_TIER_THRESHOLDS.boulder;
  const primaryScaleId = resolvedType === "boulder" ? "font" : "french";
  const r = gradeOrdinal(grade, scaleId) ?? Infinity;
  let tier = thresholds[0][0];
  for (const [name, fromGrade] of thresholds) {
    // A broken threshold fails closed.
    if (fromGrade !== null && r >= (gradeOrdinal(fromGrade, primaryScaleId) ?? Infinity)) tier = name;
  }
  return tier;
}

export function gradeColorForScale(grade, scaleId, type) {
  return GRADE_TIER_COLORS[gradeTierForScale(grade, scaleId, type)];
}

export function gradePyramidColorForScale(grade, scaleId, type) {
  const resolvedType = type ?? "boulder";
  const primaryScaleId = resolvedType === "boulder" ? "font" : "french";
  const list = resolvedType === "boulder" ? FONT_STANDARD_LABELS : FRENCH_STANDARD_LABELS;
  const maxRank = gradeOrdinal(list[list.length - 1], primaryScaleId);
  const r = gradeOrdinal(grade, scaleId) ?? Infinity;
  const frac = Math.min(1, Math.max(0, r / maxRank));
  const pos = frac * (FIERY_RED_SUNSET.length - 1);
  const lo = Math.floor(pos);
  if (pos === lo) return FIERY_RED_SUNSET[lo];
  const hi = lo + 1;
  const loPct = Math.round((hi - pos) * 100);
  return `color-mix(in srgb, ${FIERY_RED_SUNSET[lo]} ${loPct}%, ${FIERY_RED_SUNSET[hi]})`;
}
