// Extracted from client/main.js (#206). The Grade Pyramid's (#12) send-
// counting and promotion-window logic -- takes entries as an explicit
// parameter instead of reading main.js's module-global ALL_ENTRIES
// directly, so this stays testable without a DOM or the rest of the app.
// Moved into shared/ (#111) alongside grade-data.js -- these pure, DOM-free
// functions now run in the Worker too (server/api/performance.js computes
// the full pyramid server-side, so a large logbook never ships raw entries
// to /performance at all), not just the client.
import { BOULDER_GRADES, LEAD_GRADES } from "./grade-data.js";

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

export function pyramidCounts(type, entries) {
  const order = (type === "boulder" ? BOULDER_GRADES : LEAD_GRADES).map(x => x.g);
  const counts = Object.fromEntries(order.map(g => [g, 0]));
  for (const e of entries) {
    if (e.type !== type || e.status !== "send" || !isWithinLast12Months(e.date)) continue;
    if (counts[e.grade] !== undefined) counts[e.grade]++;
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

// Splits the discipline's full grade order into the 8-4-2-1 window and
// everything below it (shown collapsed by default -- see show/hide-
// lower-grades link in renderPyramid). The window used to be "count
// down 4 tiers from the max sent grade, clamped at the low end", which
// degraded to a 1-tier "complete" pyramid once max-sent was already
// the lowest supported grade (#131). It's now a promotion-step anchor,
// stateless and recomputed fresh from current sends every render: if
// the top (up to) 3 real tiers already have enough volume to be ready
// for the next grade up, the window promotes by one -- even into a
// grade with zero sends yet -- and the display always spans a full 4
// tiers, extending upward rather than truncating near the list's
// start. `promotedGrade` marks the single tier (if any) that was just
// promoted this render, for the achievement-styled treatment; a real
// send landing at or beyond it on a later render moves `maxSentIdx`
// there directly, so there's nothing to "un-promote".
// #209 -- everything below each discipline's Beginner/Intermediate
// boundary (#462: Boulder `6A`, Sport `6a`) collapses into one
// aggregated base row in `lower` instead of a rung per grade. #129's own
// range extension (Boulder down to `1`/`1A`, Sport down to French `1`)
// means the unaggregated `lower` section could otherwise show dozens of
// near-empty historical rows -- the pyramid's job is showing progress
// near the climber's limit, not auditing their entire logged history.
// Deliberately scoped to `lower` only, never `top4`: a genuine beginner
// whose near-limit progress sits entirely below this boundary still
// sees their real per-grade 8-4-2-1 window, not one flattened bucket --
// the aggregation only declutters the collapsed-by-default section
// below that window, per #209's own reasoning.
const BELOW_TIER_THRESHOLD = { boulder: "6A", sport: "6a" };

export function pyramidSplitRows(type, entries) {
  const { order, counts } = pyramidCounts(type, entries);
  const sentTiers = order.filter(g => counts[g] > 0);
  if (!sentTiers.length) return { top4: [], lower: [], hasSends: false, promotedGrade: null };

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

  const firstSentIdx = order.indexOf(sentTiers[0]);

  // `boundary` clamps the discipline's own threshold index into
  // [firstSentIdx, windowStartIdx] -- the actual span `lower` ever
  // covers -- so every one of the three real shapes below falls out of
  // the same slicing logic instead of three hand-written branches:
  // threshold above the whole span (nothing to aggregate, unchanged
  // behavior), threshold below the whole span (one aggregated row, no
  // individual rows), or threshold strictly inside it (both).
  const belowThresholdGrade = BELOW_TIER_THRESHOLD[type];
  const boundary = Math.min(Math.max(order.indexOf(belowThresholdGrade), firstSentIdx), windowStartIdx);

  const individual = order.slice(boundary, windowStartIdx)
    .map(g => ({ grade: g, count: counts[g] }))
    .reverse();

  const aggregatedRange = order.slice(firstSentIdx, boundary);
  const lower = aggregatedRange.length
    ? [
        ...individual,
        {
          // `grade` stays a real grade (the hardest of the aggregated
          // range) so gradeColor() still resolves a real curated colour
          // -- "Below 6A" itself isn't a grade `gradeColor()`/`gradeRank()`
          // know about, and would otherwise fall through to the
          // fractional-banding fallback at the wrong end of the scale.
          // `label` carries the actual display text instead.
          grade: order[boundary - 1],
          label: `Below ${belowThresholdGrade}`,
          count: aggregatedRange.reduce((sum, g) => sum + counts[g], 0),
        },
      ]
    : individual;

  return { top4, lower, hasSends: true, promotedGrade };
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
