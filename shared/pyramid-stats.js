// Extracted from client/main.js (#206). The Grade Pyramid's (#12) send-
// counting and promotion-window logic -- takes entries as an explicit
// parameter instead of reading main.js's module-global ALL_ENTRIES
// directly, so this stays testable without a DOM or the rest of the app.
// Moved into shared/ (#111) alongside grade-data.js -- these pure, DOM-free
// functions now run in the Worker too (server/api/performance.js computes
// the full pyramid server-side, so a large logbook never ships raw entries
// to /performance at all), not just the client.
import { BOULDER_GRADES, LEAD_GRADES, gradeOrdinal, SCALES } from "./grade-data.js";

// 8-4-2-1 is a widely used coaching heuristic (Hörst, Hampton -- see the
// citations dialog), not a scientifically validated ratio; framed that
// way everywhere it's surfaced in the UI, never as fact. Exported (not
// module-private) -- main.js's own rendering code reads this directly to
// label each row with its ideal count, not just the functions below.
export const PYRAMID_IDEAL_BY_POSITION = [1, 2, 4, 8]; // position 0 = current max (ideal 1) ... position 3 = base tier (ideal 8)

// Sends only (a "send" covers both flash/onsight and redpoint), from the
// last 12 months only, per Hampton's original framing ("8 climbs done in
// the past 12 months at a grade"). Dates can be stored as "YYYY",
// "YYYY-MM", or "YYYY-MM-DD" (see the Date field's own helper text) --
// new Date() parses all three as UTC, same as dateRank() relies on
// elsewhere in this app for sorting.
export function isWithinLast12Months(d) {
  if (!d) return false;
  const t = new Date(d).getTime();
  if (Number.isNaN(t)) return false;
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 1);
  return t >= cutoff.getTime();
}

// #728 -- #726 patched the reported symptom (a case mismatch) with a
// case-insensitive string match against BOULDER_GRADES/LEAD_GRADES's own
// fixed labels -- a hack sitting on the pre-#702 system, not the
// canonical model this whole epic exists to deliver. That left the real
// gap open: those two lists only ever cover each discipline's OLD ad-hoc
// hybrid notation, and #703 already lets a send be logged in any of a
// discipline's real scales (V-scale, UIAA, YDS, Norwegian, Ewbank) --
// none of which appear in these lists at all, so they were (and without
// this fix, still would be) silently dropped regardless of casing.
//
// Fixed properly: every entry joins via the shared canonical ordinal
// (gradeOrdinal), the same building block #704/#705 already used for
// reports and the reference page, not a string/case match against one
// hand-typed list -- correctly resolves a send logged in ANY of the
// discipline's scales onto the right existing row.
//
// `ROW_SCALE_BY_TYPE` is used only to resolve each ROW's own ordinal
// (BOULDER_GRADES/LEAD_GRADES's own labels already decompose through
// this exact formula -- that's exactly why #702's migration lowercased
// Boulder's stored grade text to fit it), independent of whatever real
// scale a given ENTRY was actually logged in.
// #737 -- exported: buildRows()/pyramidCounts() below need it to know
// which viewScaleId counts as "the native view" (using BOULDER_GRADES/
// LEAD_GRADES's own curated list) versus any other scale (using that
// scale's own `labels`); server/api/performance.js also reads it as the
// default viewScaleId when a request doesn't specify one.
export const ROW_SCALE_BY_TYPE = { boulder: "font-non-standard", sport: "french-non-standard" };
// Fallback only for an entry with no real gradeScale at all -- shouldn't
// happen for any real row today (#702's migration backfilled every
// existing row, server/api/entries.js's defaultGradeScale() guarantees
// every future write sets one), but a cheap defensive default avoids a
// silently-dropped entry if that guarantee is ever violated, rather than
// crashing or comparing against `undefined`.
const DEFAULT_SCALE_BY_TYPE = ROW_SCALE_BY_TYPE;

// #737 -- Raven, 2026-09-12: switching the report scale picker isn't a
// relabeling of the SAME fixed rows -- "the tiers should represent 4
// sequential grades in the selected scale." A coarser scale genuinely
// has fewer real steps than font-non-standard/french-non-standard (e.g.
// V-scale's V3 spans both Font 6A and 6A+), so viewing in that scale
// means the row LIST itself changes: 6A and 6A+ become ONE real V3 row
// with their counts combined, not two rows that happen to share a label
// (which is what merely relabeling the fixed native rows produced --
// confirmed live as a real bug, two differently-countED rows both
// reading "V3").
//
// For the discipline's own native (non-standard) scale, rows are still
// BOULDER_GRADES/LEAD_GRADES's curated, real-climbing-relevant list
// (unchanged from before this rework). Every OTHER scale a viewer can
// pick already carries its own finite, curated `labels` list (font/
// french-standard, v-scale, uiaa, yds, norwegian, ewbank) -- that list
// IS the real row set for that scale, no separate curation needed.
function nativeRowLabels(type) {
  return (type === "boulder" ? BOULDER_GRADES : LEAD_GRADES).map(x => x.g);
}

// BOULDER_GRADES's own hand-typed order (`1, 1+, 1A, 1B, 1C, 2, ...`)
// predates the corrected canonical sub-position rule (`2 < 2a+ < 2+`,
// Raven's own worked example, 2026-09-11 -- a bare `+` is the TOP of its
// number, not a notch above the bare number) -- it still sorts `N+`
// right after `N`, ahead of the lettered grades, for every number 1-5.
// Sport's own order already agrees with the corrected rule (confirmed by
// checking every ordinal directly), so re-sorting is a real behavior fix
// for Boulder's low end and a no-op for Sport. Row labels themselves are
// unchanged -- this corrects matching and ordering, not what the pyramid
// displays. Every non-native scale's own `labels` array is already in
// real ascending order, so this sort is a no-op there -- kept unified
// (not branched) since sorting an already-sorted list is cheap and this
// keeps buildRows() correct even if a scale's own list order ever drifts.
function buildRows(type, viewScaleId) {
  const rowScale = ROW_SCALE_BY_TYPE[type];
  const labels = viewScaleId === rowScale ? nativeRowLabels(type) : SCALES[viewScaleId].labels;
  return labels
    .map(label => ({ label, ordinal: gradeOrdinal(label, viewScaleId) }))
    .sort((a, b) => a.ordinal - b.ordinal);
}

// `viewScaleId` defaults to the discipline's own native row scale --
// every existing caller (this file's own pyramidSplitRows below, and
// every existing test) that doesn't pass one keeps its exact prior
// behavior.
export function pyramidCounts(type, entries, viewScaleId = ROW_SCALE_BY_TYPE[type]) {
  const rowScale = ROW_SCALE_BY_TYPE[type];
  const rows = buildRows(type, viewScaleId);
  const order = rows.map(r => r.label);
  const counts = Object.fromEntries(order.map(g => [g, 0]));
  const defaultScale = DEFAULT_SCALE_BY_TYPE[type];
  const isNativeView = viewScaleId === rowScale;
  // Native view: exact-ordinal match only, same behavior as before this
  // rework -- BOULDER_GRADES/LEAD_GRADES is a curated SUBSET of the full
  // non-standard combinatorial space, and an entry at an uncurated sub-
  // position (e.g. "6a-") isn't silently reassigned to a neighboring row
  // here (a real, separate, pre-existing gap -- not this rework's to fix).
  // Non-native view: the chosen scale's own toLabel() already implements
  // the correct "which real step does this ordinal belong to" resolution
  // (closest-match for Font/French-standard and the anchored scales,
  // V-scale's own multi-wide-step floor logic) -- reused directly rather
  // than a second bucketing algorithm; null (below that scale's own
  // floor) means the entry is excluded from this view, never inflated
  // onto a row it doesn't belong at (Raven's own explicit correction,
  // 2026-09-12).
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

// Is `idx` (and up to two grades below it) already sent enough to be
// considered "ready to push" into the next grade up? Checked against
// the ideal one position HARDER than each tier's own slot (position 0
// = hardest/tier 1 ... position 3 = base/tier 4) -- e.g. tier 1 needs
// tier 2's ideal (2) to be ready to promote, tier 2 needs tier 3's (4),
// and so on. Stops as soon as it runs off the bottom of the grade
// list, so this is the same check whether 1, 2, or 3 real tiers
// currently exist below `idx` (#131 -- see the PRD's truth table for
// worked examples of each case).
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

// Splits the discipline's full grade order into the 8-4-2-1 window --
// a pure 8-4-2-1 report, nothing below it (#737 removed the "Show lower
// grades" section entirely, see its own note below). The window used to
// be "count down 4 tiers from the max sent grade, clamped at the low
// end", which degraded to a 1-tier "complete" pyramid once max-sent was
// already the lowest supported grade (#131). It's now a promotion-step
// anchor, stateless and recomputed fresh from current sends every
// render: if the top (up to) 3 real tiers already have enough volume to
// be ready for the next grade up, the window promotes by one -- even
// into a grade with zero sends yet -- and the display always spans a
// full 4 tiers, extending upward rather than truncating near the list's
// start. `promotedGrade` marks the single tier (if any) that was just
// promoted this render, for the achievement-styled treatment; a real
// send landing at or beyond it on a later render moves `maxSentIdx`
// there directly, so there's nothing to "un-promote".
//
// #209 originally added a "lower" section below this window (everything
// the climber has ever sent, collapsed below 6A/6a into one aggregated
// row -- a workaround for the OLD pre-#702 combined grading, where that
// boundary was also where Font/V-scale naming diverged). #737 first
// fixed the aggregation's own boundary math, then removed the whole
// section outright (Raven, 2026-09-13): once every row shows
// individually (no more lossy aggregation to hide behind), a discipline
// with fine-grained non-standard notation produces a very long list of
// mostly-zero rows with no real value -- a per-grade volume BREAKDOWN
// is a genuinely different, useful report in its own right (tracked
// separately, #739), not something to bolt onto this one. The pyramid
// is a pure 8-4-2-1 report now.
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

// #687 -- the health-card message-selection logic used to live inline in
// client/components/climbing-grade-pyramid.js's own #render(), the one
// Performance Insights view whose coaching message wasn't a pure,
// unit-tested shared/*.js function (see docs/coaching-messaging-rules.md,
// #633). Extracted here, decision-only -- no HTML/icon/copy, same
// "resolve once, format per consumer" split every other function in this
// file already follows. top4 is ordered hardest (index 0) to
// easiest-of-the-four (index 3), matching pyramidSplitRows' own output
// and PYRAMID_IDEAL_BY_POSITION's [1,2,4,8] ordering.
//
// Branches, in priority order (docs/coaching-messaging-rules.md has the
// full reasoning for each):
// - "promoted": ready to push into a new grade (stillBuilding further
//   distinguishes whether every other displayed tier already has
//   volume, or the climber is still building the base under a
//   fresh promotion).
// - "gap": a literal zero-count tier -- checked before top-heavy so a
//   real gap gets its own, more specific message rather than being
//   folded into the ratio check below.
// - "top-heavy": no literal gap, but a harder tier (top4[i-1]) has MORE
//   sends than an easier tier beneath it (top4[i]) -- an inversion
//   relative to the 8-4-2-1 shape, distinct from mere presence.
// - "healthy": neither of the above -- every tier is non-zero and
//   non-increasing toward the base.
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
