// #14 (epic #5 Phase 2) -- pure, DOM-free aggregation over entries data,
// computed server-side (server/api/performance.js), same convention as
// every other shared/*-stats.js module in this epic. Reuses shared/
// volume-stats.js's own bucketIndexForDate/reportGradeLabel directly
// rather than duplicating them -- both modules bucket over the same
// entries shape, no reason to reimplement that here.
import { bucketIndexForDate, reportGradeLabel, reportPositionOrder } from "./volume-stats.js";
import { gradeOrdinal, DEFAULT_SCALE_BY_TYPE as DEFAULT_VIEW_SCALE_BY_TYPE } from "./grade-data.js";

// gapHeadline is computed server-side (server/api/performance.js) before
// the client's own picker preference is known, so its first render needs
// the same "non-standard scales are never the default" fallback
// client/report-grade-scale-picker.js's own picker opens on --
// grade-data.js's DEFAULT_SCALE_BY_TYPE is that single shared source now
// (#754 -- this file, entry-form.js, and report-grade-scale-picker.js
// each independently hand-copied the identical map). The client's own
// renderGap() always re-calls this with the real, current viewScaleId
// once it mounts (see performance-gap-main.js), so this default only
// ever shows in the brief window before that first client-side render.

// #717 -- flash/send "best so far" used to be tracked as a bare grade
// string, compared via the 2-arg gradeRank(entry.grade, type) -- the
// same disease #728 found and fixed in shared/pyramid-stats.js's own
// pyramidCounts(): correct only if every entry in the discipline is in
// one single implicit scale, which #703's picker already makes untrue.
// Fixed the same way: compare via the shared canonical ordinal
// (gradeOrdinal(entry.grade, entry.gradeScale)), and track each bucket's
// own winner as a real { grade, gradeScale } pair, not a bare string, so
// gapHeadline below can resolve its own real display label rather than
// guessing which scale a winning grade came from.
const PRIMARY_SCALE_BY_TYPE = { boulder: "font-non-standard", sport: "french" };

function bestGradeOrdinal(entry, type) {
  return gradeOrdinal(entry.grade, entry.gradeScale ?? PRIMARY_SCALE_BY_TYPE[type] ?? PRIMARY_SCALE_BY_TYPE.boulder);
}

export function gapByBucket(entries, buckets, type) {
  const flashMaxByBucket = buckets.map(() => null);
  const sendMaxByBucket = buckets.map(() => null);
  const flashMaxOrdinalByBucket = buckets.map(() => null);
  const sendMaxOrdinalByBucket = buckets.map(() => null);
  const attemptsSumByBucket = buckets.map(() => 0);
  const attemptsCountByBucket = buckets.map(() => 0);

  for (const entry of entries) {
    if (entry.status !== "send" || !entry.date) continue;
    const idx = bucketIndexForDate(entry.date, buckets);
    if (idx === -1) continue;

    const ordinal = bestGradeOrdinal(entry, type);
    const pair = { grade: entry.grade, gradeScale: entry.gradeScale ?? PRIMARY_SCALE_BY_TYPE[type] ?? PRIMARY_SCALE_BY_TYPE.boulder };
    if (ordinal !== null && (sendMaxOrdinalByBucket[idx] === null || ordinal > sendMaxOrdinalByBucket[idx])) {
      sendMaxOrdinalByBucket[idx] = ordinal;
      sendMaxByBucket[idx] = pair;
    }
    if (entry.firstAttempt && ordinal !== null && (flashMaxOrdinalByBucket[idx] === null || ordinal > flashMaxOrdinalByBucket[idx])) {
      flashMaxOrdinalByBucket[idx] = ordinal;
      flashMaxByBucket[idx] = pair;
    }
    if (entry.attemptsToSend !== null && entry.attemptsToSend !== undefined) {
      attemptsSumByBucket[idx] += entry.attemptsToSend;
      attemptsCountByBucket[idx]++;
    }
  }

  // #603 -- null (not 0) for a bucket with no attemptsToSend data at
  // all, distinct from a real, measured 0. A real send with no recorded
  // attempts-to-send used to render as a bar visually identical to a
  // genuine zero average, reading as an unexplained gap on the chart
  // (client/combo-chart.js's own bar rendering treats null as "no
  // data", rendering a dash label with no rect, rather than a
  // zero-height bar).
  const avgAttemptsByBucket = attemptsCountByBucket.map((count, i) =>
    count ? Math.round((attemptsSumByBucket[i] / count) * 10) / 10 : null
  );

  return { flashMaxByBucket, sendMaxByBucket, avgAttemptsByBucket };
}

// Small, self-contained vocabulary duplication of client/status.js's own
// flashLabel/sendLabel -- this function is server-computed (like every
// other headline generator in this epic), and a shared/*.js module
// computed server-side can't import a client/*.js module without
// breaking this codebase's established shared/client layering. See this
// plan's own Global Constraints for the full reasoning -- same tradeoff
// shared/strengths-stats.js's own WALL_ANGLE_ADJECTIVE already made.
// #430 -- Lead renamed to Sport. 'lead' briefly lived alongside 'sport'
// here (#651) while historical entries still carried it; removed now
// that #646's data cutover converted every real entry away from it.
const FLASH_TERM = { boulder: "flash", sport: "onsight" };
const SEND_TERM = { boulder: "send", sport: "redpoint" };

// #717 -- "N grade-steps ahead" used to count raw index positions in
// BOULDER_ORDER/LEAD_ORDER (gradeRank's own internal list) -- uniform by
// construction there (one array slot = one step), but the shared
// canonical ordinal space isn't uniformly spaced between two real named
// grades (e.g. 6A->6A+ is 1 ordinal apart, 6C+->7A is 5 apart -- the
// combinatorial formula's own sub-position slots, most of which aren't
// real named steps at all). A raw ordinal difference would silently
// change what "1 step" means. reportPositionOrder(type) (shared/volume-
// stats.js) is the discipline's own real named-step sequence in
// ascending ordinal order -- already what #704's own chart positioning
// uses -- so "how many real steps apart" is each ordinal's own INDEX in
// that sequence, not the ordinal value itself. An ordinal that doesn't
// land exactly on a real named step (e.g. a Non-standard "-" modifier,
// which Font-standard/French-standard never use) falls back to its
// nearest real step below it, same "closest, not exact" degrade
// makeAnchoredScale's own toLabel() already uses elsewhere in this
// model, rather than treating an in-between ordinal as unrankable.
function stepIndex(ordinal, positionOrder) {
  let idx = positionOrder.findIndex(o => o === ordinal);
  if (idx !== -1) return idx;
  for (let i = positionOrder.length - 1; i >= 0; i--) {
    if (positionOrder[i] < ordinal) return i;
  }
  return 0;
}

// Compares the window's single best first-attempt-success grade against
// its single best eventual-send grade -- not a per-bucket comparison,
// since the two bests can legitimately land in different months and the
// headline is about what's been demonstrated across the whole window.
export function gapHeadline(flashMaxByBucket, sendMaxByBucket, type, viewScaleId = DEFAULT_VIEW_SCALE_BY_TYPE[type]) {
  const flashTerm = FLASH_TERM[type];
  const sendTerm = SEND_TERM[type];
  const positionOrder = reportPositionOrder(type);
  // #704/#733 -- was gradeDisplayLabelForScale, a DIFFERENT helper that
  // deliberately always renders Boulder grades in V-scale (the "/V3"
  // hint next to entry-form.js's own Font picker) regardless of any
  // report-page scale preference -- reusing it here meant this headline
  // never responded to the picker at all, unlike the chart's own line
  // labels (which already used reportGradeLabel below). Found live: the
  // picker visibly relabels the chart's points but the headline text
  // stayed stuck in V-scale ("VB") no matter what was selected.
  //
  // #733 -- unlike a chart POINT, this prose mention can't just be
  // dropped when the chosen view scale has no representation for a
  // grade (e.g. a Font-non-standard "2+" best send, viewed in
  // Font-standard) -- there's no equivalent of "no point here" for a
  // sentence about your own best send. Falls back to the grade's own
  // logged scale for that one mention rather than a broken "(null)" or
  // reintroducing the raw-string bug this whole fix exists to close.
  const label = pair => reportGradeLabel(pair.grade, pair.gradeScale, type, viewScaleId)
    ?? reportGradeLabel(pair.grade, pair.gradeScale, type, pair.gradeScale);
  const ordinalOf = pair => bestGradeOrdinal(pair, type);

  const sendGrades = sendMaxByBucket.filter(g => g !== null);
  if (sendGrades.length === 0) return "No sends logged in this window yet.";
  const bestSend = sendGrades.reduce((best, g) => (ordinalOf(g) > ordinalOf(best) ? g : best));

  const flashGrades = flashMaxByBucket.filter(g => g !== null);
  if (flashGrades.length === 0) {
    return `No ${flashTerm} sends logged in this window yet -- your best ${sendTerm} is ${label(bestSend)}.`;
  }
  const bestFlash = flashGrades.reduce((best, g) => (ordinalOf(g) > ordinalOf(best) ? g : best));

  const gap = stepIndex(ordinalOf(bestSend), positionOrder) - stepIndex(ordinalOf(bestFlash), positionOrder);
  if (gap <= 0) {
    return `Your best ${flashTerm} (${label(bestFlash)}) matches or beats your best ${sendTerm} (${label(bestSend)}) this window.`;
  }
  return `Your best ${sendTerm} (${label(bestSend)}) is ${gap} grade-step${gap === 1 ? "" : "s"} ahead of your best ${flashTerm} (${label(bestFlash)}) this window.`;
}
