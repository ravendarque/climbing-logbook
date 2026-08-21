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
  const lower = order.slice(firstSentIdx, windowStartIdx)
    .map(g => ({ grade: g, count: counts[g] }))
    .reverse();

  return { top4, lower, hasSends: true, promotedGrade };
}
