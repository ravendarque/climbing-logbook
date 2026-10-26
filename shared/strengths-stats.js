import vocabulary from "@ravendarque/beta-interpreter/vocabulary/terms.json" with { type: "json" };
import { DEFAULT_SCALE_BY_TYPE, SCALES, gradeOrdinal } from "./grade-data.js";
import { ENTRY_WALL_ANGLES } from "./entry-schema.js";
import { MIN_TAG_COUNT, humanize, pluralizeHoldType } from "./tag-stats-helpers.js";

export { MIN_TAG_COUNT };

const LEVEL_SAMPLE = 5;
// "Two grades" is two steps on the grade ladder: 6A to 6B, not 6A to 6A+.
const BELOW_LEVEL_STEPS = 2;
const HEAT_HOLDS = 6;

const ladders = {};
// The discipline's standard scale as a list, so one step is always one grade.
function ladder(type) {
  if (!ladders[type]) {
    const scale = SCALES[DEFAULT_SCALE_BY_TYPE[type]];
    const labels = [...new Set(Array.from({ length: 200 }, (_, o) => scale.toLabel(o)).filter(Boolean))];
    ladders[type] = { labels, index: new Map(labels.map((label, i) => [label, i])) };
  }
  return ladders[type];
}

function stepOf(entry) {
  const ordinal = gradeOrdinal(entry.grade, entry.gradeScale ?? DEFAULT_SCALE_BY_TYPE[entry.type]);
  if (ordinal == null) return null;
  return ladder(entry.type).index.get(SCALES[DEFAULT_SCALE_BY_TYPE[entry.type]].toLabel(ordinal)) ?? null;
}

// Rounded down between two grades, so a level is never flattered.
function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.floor((sorted[mid - 1] + sorted[mid]) / 2);
}

function levelStep(entries) {
  const sends = entries
    .filter(e => e.status === "send")
    .map(stepOf)
    .filter(step => step != null)
    .sort((a, b) => b - a);
  return sends.length >= MIN_TAG_COUNT ? median(sends.slice(0, LEVEL_SAMPLE)) : null;
}

function kindOf(term) {
  if (term.facets.includes("transition")) return "move";
  if (term.facets.includes("hold") || term.facets.includes("feature")) return "hold";
  return term.facets.includes("position") ? "position" : null;
}

const TERMS = new Map(vocabulary.terms.map(term => [term.id, term]));

// Every term the stored movements name once, whichever movement it's in; the server read them from the beta on save.
function cruxTerms(movements) {
  const ids = new Set();
  for (const movement of movements) {
    for (const id of movement.transition?.terms ?? []) ids.add(id);
    for (const state of [movement.start, movement.end]) {
      for (const contact of [...Object.values(state.limbs), ...state.unplaced]) {
        if (contact.hold?.ori) ids.add(contact.hold.ori);
        for (const id of contact.hold?.kinds ?? []) ids.add(id);
        for (const id of contact.techniques) ids.add(id);
      }
      for (const id of state.body) ids.add(id);
    }
  }
  return [...ids].flatMap(id => {
    const term = TERMS.get(id);
    return term && kindOf(term) ? [term] : [];
  });
}

const article = word => (/^[aeiou]/i.test(word) ? "an" : "a");

function insightsFor(angles, items) {
  const insights = [];
  const levelled = angles.filter(a => a.level);
  if (levelled.length >= 2) {
    const best = levelled.reduce((a, b) => (b.step > a.step ? b : a));
    const weakest = levelled.reduce((a, b) => (b.step < a.step ? b : a));
    if (best.step - weakest.step >= BELOW_LEVEL_STEPS) {
      const name = humanize(weakest.angle).toLowerCase();
      const rare = weakest.share < 20 ? `, and ${name} is only ${weakest.share}% of what you climb` : "";
      insights.push({
        tone: "negative",
        title: `${humanize(weakest.angle)} is your weak angle`,
        text: `Your level on ${name} is ${weakest.level}, against ${best.level} on ${humanize(best.angle).toLowerCase()}${rare}. Climbing more ${name} is the quickest way up.`,
      });
    }
  }
  const weak = items.filter(i => i.below >= 2 && i.below > i.limit).sort((a, b) => b.below - a.below)[0];
  if (weak) {
    const name = weak.name.toLowerCase();
    insights.push({
      tone: "negative",
      title: `${weak.name}: hard below your level`,
      text: `${weak.below} of the ${weak.below + weak.limit} climbs whose hardest move had ${article(name)} ${name} were two or more grades under your level for that angle. Look for ${pluralizeHoldType(name)} on climbs you'd expect to cruise.`,
    });
  }
  const ceiling = items.filter(i => i.limit >= MIN_TAG_COUNT && i.below === 0).sort((a, b) => b.limit - a.limit)[0];
  if (ceiling) {
    insights.push({
      tone: "positive",
      title: `${ceiling.name}: only at your limit`,
      text: `${ceiling.name} is in the hardest move only on climbs at your level. That's your ceiling, not a weakness.`,
    });
  }
  return insights;
}

export function strengthsFor(type, entries) {
  const climbs = entries.filter(
    e => e.type === type && e.status !== "checkout" && ENTRY_WALL_ANGLES.includes(e.wallAngle),
  );
  const byAngle = Object.groupBy(climbs, e => e.wallAngle);

  const angles = ENTRY_WALL_ANGLES.map(angle => {
    const onAngle = byAngle[angle] ?? [];
    const step = levelStep(onAngle);
    return {
      angle,
      climbs: onAngle.length,
      share: climbs.length ? Math.round((onAngle.length / climbs.length) * 100) : 0,
      level: step == null ? null : ladder(type).labels[step],
      step,
    };
  });
  const angleStep = Object.fromEntries(angles.map(a => [a.angle, a.step]));

  const itemsById = new Map();
  const heat = new Map();
  let described = 0;
  for (const climb of climbs) {
    if (!climb.hardestBeta?.trim()) continue;
    described++;
    const terms = cruxTerms(climb.movements ?? []);
    const level = angleStep[climb.wallAngle];
    const step = stepOf(climb);
    const judged = level != null && step != null;
    const below = judged && level - step >= BELOW_LEVEL_STEPS;
    for (const term of terms) {
      const item = itemsById.get(term.id) ?? { id: term.id, name: term.name, kind: kindOf(term), below: 0, limit: 0 };
      if (judged) item[below ? "below" : "limit"]++;
      itemsById.set(term.id, item);
      if (term.facets.includes("hold")) {
        const row = heat.get(term.id) ?? { id: term.id, name: term.name, counts: ENTRY_WALL_ANGLES.map(() => 0) };
        row.counts[ENTRY_WALL_ANGLES.indexOf(climb.wallAngle)]++;
        heat.set(term.id, row);
      }
    }
  }

  const items = [...itemsById.values()]
    .filter(i => i.below + i.limit >= MIN_TAG_COUNT)
    .sort((a, b) => b.below - a.below || b.below + b.limit - (a.below + a.limit));
  const total = row => row.counts.reduce((sum, n) => sum + n, 0);
  const heatRows = [...heat.values()].sort((a, b) => total(b) - total(a)).slice(0, HEAT_HOLDS);

  return {
    climbs: climbs.length,
    described,
    angles,
    items,
    heat: heatRows,
    insights: insightsFor(angles, items),
  };
}
