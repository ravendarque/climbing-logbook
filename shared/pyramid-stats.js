import { BOULDER_GRADES, LEAD_GRADES, gradeOrdinal, SCALES } from "./grade-data.js";

// 8-4-2-1 is a coaching heuristic (Hörst, Hampton), not a validated ratio; the UI says so.
export const PYRAMID_IDEAL_BY_POSITION = [1, 2, 4, 8]; // position 0 = current max (ideal 1) ... position 3 = base tier (ideal 8)

export function isWithinLast12Months(d) {
  if (!d) return false;
  const t = new Date(d).getTime();
  if (Number.isNaN(t)) return false;
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 1);
  return t >= cutoff.getTime();
}

// Rows resolve through this scale; entries through their own logged scale.
export const ROW_SCALE_BY_TYPE = { boulder: "font-non-standard", sport: "french-non-standard" };
const DEFAULT_SCALE_BY_TYPE = ROW_SCALE_BY_TYPE;

// A coarser view scale has fewer rows (V3 merges 6A and 6A+), not relabelled native rows.
function nativeRowLabels(type) {
  return (type === "boulder" ? BOULDER_GRADES : LEAD_GRADES).map(x => x.g);
}

// Sorted by ordinal: BOULDER_GRADES's hand-typed order predates the rule that bare + tops its number.
function buildRows(type, viewScaleId) {
  const rowScale = ROW_SCALE_BY_TYPE[type];
  const labels = viewScaleId === rowScale ? nativeRowLabels(type) : SCALES[viewScaleId].labels;
  return labels
    .map(label => ({ label, ordinal: gradeOrdinal(label, viewScaleId) }))
    .sort((a, b) => a.ordinal - b.ordinal);
}

export function pyramidCounts(type, entries, viewScaleId = ROW_SCALE_BY_TYPE[type]) {
  const rowScale = ROW_SCALE_BY_TYPE[type];
  const rows = buildRows(type, viewScaleId);
  const order = rows.map(r => r.label);
  const counts = Object.fromEntries(order.map(g => [g, 0]));
  const defaultScale = DEFAULT_SCALE_BY_TYPE[type];
  const isNativeView = viewScaleId === rowScale;
  // Native rows are a curated subset, so an uncurated sub-position matches no row there.
  const rowByOrdinal = isNativeView ? new Map(rows.map(r => [r.ordinal, r.label])) : null;
  const viewScale = SCALES[viewScaleId];
  for (const e of entries) {
    if (e.type !== type || e.status !== "send" || !isWithinLast12Months(e.date)) continue;
    const ordinal = gradeOrdinal(e.grade, e.gradeScale ?? defaultScale);
    if (ordinal === null) continue;
    const row = isNativeView ? rowByOrdinal.get(ordinal) : viewScale.toLabel(ordinal);
    if (row != null && counts[row] !== undefined) counts[row]++;
  }
  return { order, counts };
}

// Each tier is checked against the ideal of the position above it: tier 1 needs tier 2's 2, and so on.
export function pyramidReadyToPromote(order, counts, idx) {
  for (let pos = 0; pos <= 2; pos++) {
    const gradeIdx = idx - pos;
    if (gradeIdx < 0) break;
    const need = PYRAMID_IDEAL_BY_POSITION[pos + 1];
    if (need === undefined) break;
    if (counts[order[gradeIdx]] < need) return false;
  }
  return true;
}

// docs/grade-pyramid-approach.md: the window promotes into the next grade once the tiers below are ready.
export function pyramidSplitRows(type, entries, viewScaleId = ROW_SCALE_BY_TYPE[type]) {
  const { order, counts } = pyramidCounts(type, entries, viewScaleId);
  const sentTiers = order.filter(g => counts[g] > 0);
  if (!sentTiers.length) return { top4: [], hasSends: false, promotedGrade: null };

  const maxGrade = sentTiers[sentTiers.length - 1];
  let topIdx = order.indexOf(maxGrade);

  let promotedGrade = null;
  if (topIdx < order.length - 1 && pyramidReadyToPromote(order, counts, topIdx)) {
    topIdx += 1;
    promotedGrade = order[topIdx];
  }

  const displayTop = Math.max(topIdx, Math.min(3, order.length - 1));
  const windowStartIdx = Math.max(0, displayTop - 3);

  const top4 = order.slice(windowStartIdx, displayTop + 1)
    .map(g => ({ grade: g, count: counts[g] }))
    .reverse(); // hardest (ideal 1) first

  return { top4, hasSends: true, promotedGrade };
}

// Branches, in priority order: docs/coaching-messaging-rules.md.
export function pyramidHealth(top4, promotedGrade) {
  if (promotedGrade) {
    const stillBuilding = top4.some(r => r.count === 0 && r.grade !== promotedGrade);
    return { kind: "promoted", stillBuilding, grade: promotedGrade };
  }
  const gapRow = top4.find(r => r.count === 0);
  if (gapRow) return { kind: "gap", grade: gapRow.grade };
  const topHeavyRow = top4.find((r, i) => i > 0 && r.count < top4[i - 1].count);
  if (topHeavyRow) return { kind: "top-heavy", grade: topHeavyRow.grade };
  return { kind: "healthy" };
}
