// Shared combo-chart component (#15, epic #5 Phase 2) -- resolved
// 2026-08-28 alongside #569 (docs/superpowers/specs/2026-08-27-
// performance-insights-ui-design.md's "Shared combo-chart component"
// section): hand-rolled SVG, one plain JS module (not a Custom Element,
// deliberately not `climbing-`-prefixed -- that prefix is reserved for
// this app's real registered Custom Elements), N bar series + M line
// series over one shared time axis, real axis labels, data labels on
// every mark, and a required (not opt-in) headline-sentence slot.
//
// A pure string generator -- no DOM dependency at all, unlike client/
// move-tagging.js's own interactive widget (#584). Callers assign the
// returned string to a container's innerHTML, same convention every
// other client/*.js module in this codebase already uses. This is what
// lets this module's own tests run on the plain "workers" Vitest
// project with no happy-dom needed.
import { escapeHtml } from "./escape-html.js";

const CHART_WIDTH = 640;
const CHART_HEIGHT = 320;
// left: 20 wasn't enough room for the bar-series y-axis tick label text
// added below (up to a few digits) -- raised to 36. Nothing in this
// module's own tests asserts absolute pixel positions, only relative
// comparisons and element counts, so shifting the whole plot area right
// is safe (verified by rereading test/client/combo-chart.test.js before
// making this change).
const MARGIN = { top: 24, right: 20, bottom: 40, left: 36 };
const PLOT_WIDTH = CHART_WIDTH - MARGIN.left - MARGIN.right;
const PLOT_HEIGHT = CHART_HEIGHT - MARGIN.top - MARGIN.bottom;

function bucketSlotX(index, bucketCount) {
  const slotWidth = PLOT_WIDTH / bucketCount;
  return MARGIN.left + slotWidth * index;
}

function bucketCenterX(index, bucketCount) {
  const slotWidth = PLOT_WIDTH / bucketCount;
  return MARGIN.left + slotWidth * (index + 0.5);
}

// Headroom above the tallest bar so its own data label has room to sit
// above the bar without touching the plot's top edge.
function barScale(maxValue) {
  const safeMax = Math.max(1, maxValue) * 1.25;
  return v => MARGIN.top + PLOT_HEIGHT - (v / safeMax) * PLOT_HEIGHT;
}

// Shared by barsHtml and barYAxisHtml below -- both need the exact same
// maxValue/y scale so the gridlines/ticks the axis draws actually line up
// with the bars they're meant to measure. Computed once in
// renderComboChartHtml and passed down rather than each recomputing it
// independently. Filters out null (no-data) values -- see barsHtml's own
// comment -- so an empty bucket never distorts the scale.
function barMaxValue(bars) {
  return Math.max(0, ...bars.flatMap(b => b.values.filter(v => v !== null)));
}

function barsHtml(bars, bucketCount, y) {
  const slotWidth = PLOT_WIDTH / bucketCount;
  // Each bar series gets its own sub-slot within the bucket, side by
  // side (grouped bars), not stacked -- #15 only ever has one bar series
  // in practice, but the component stays genuinely N-series per the
  // design doc's own "N bars" requirement, not hardcoded to one.
  const groupWidth = slotWidth * 0.6;
  const barWidth = groupWidth / bars.length;
  const barBottom = MARGIN.top + PLOT_HEIGHT;

  return bars.map((series, seriesIndex) => series.values.map((value, bucketIndex) => {
    const slotStart = bucketSlotX(bucketIndex, bucketCount) + (slotWidth - groupWidth) / 2;
    const x = slotStart + barWidth * seriesIndex;
    const labelX = (x + barWidth * 0.425).toFixed(1);

    // #603 -- a null value means "no data for this bucket" (e.g.
    // shared/gap-stats.js's avgAttemptsByBucket / shared/effort-
    // stats.js's avgExertionByBucket both return null when no
    // qualifying entry exists in a bucket), distinct from a real,
    // measured 0. A real send with no recorded attempts-to-send used to
    // render as a zero-height bar visually identical to a genuine
    // zero average -- reading as an unexplained gap rather than a
    // legible "not recorded" state. No rect drawn at all for a
    // no-data bucket; the dash label (not "0") is what signals "not
    // recorded" rather than "recorded as zero".
    if (value === null) {
      return `<text x="${labelX}" y="${(barBottom - 6).toFixed(1)}" text-anchor="middle" class="fill-muted text-[10px]">–</text>`;
    }

    const barTop = y(value);
    const height = Math.max(0, barBottom - barTop);
    return `
      <rect x="${x.toFixed(1)}" y="${barTop.toFixed(1)}" width="${(barWidth * 0.85).toFixed(1)}" height="${height.toFixed(1)}" class="fill-accent" />
      <text x="${labelX}" y="${(barTop - 6).toFixed(1)}" text-anchor="middle" class="fill-foreground text-[10px]">${escapeHtml(String(value))}</text>
    `;
  }).join("")).join("");
}

function lineScale(positionOrder) {
  const span = Math.max(1, positionOrder.length - 1);
  return positionKey => {
    const idx = positionOrder.indexOf(positionKey);
    const safeIdx = idx === -1 ? 0 : idx;
    return MARGIN.top + PLOT_HEIGHT - (safeIdx / span) * PLOT_HEIGHT;
  };
}

// #620/#624 -- distinct colors per line series: every caller so far only
// ever had one series (RPE, Trends), so a single hardcoded foreground
// color went unnoticed until Gap's own two series (Flash/Onsight max
// grade, Send/Redpoint max grade) rendered identically and were
// impossible to tell apart. tier-heuristic (an amber, already
// theme-aware -- see client/evidence-tier.js's own text-tier-heuristic
// usage) is distinct from both foreground (series 0, unchanged) and
// accent (already used by this same chart's own bar series). NOT
// tier-peer (blue) -- blue is not in this app's palette anywhere and is
// off-limits app-wide (Raven, 2026-09-02).
//
// #624 -- COMPLETE literal class strings per entry, not
// `class="fill-${color}"`/`class="stroke-${color}"` string interpolation
// -- confirmed via a real build that Tailwind's content scanner only
// picked up `fill-tier-peer` (coincidentally, from elsewhere) and never
// generated `stroke-tier-peer`/`stroke-tier-heuristic` at all, since
// neither ever appears as a complete, literal substring anywhere in the
// source for the scanner to find. Every fill/stroke class Tailwind needs
// to generate must appear verbatim somewhere in source; this array is
// that verbatim occurrence for both properties, for every series color
// this chart uses. Cycles via modulo for a hypothetical 3rd+ series,
// though nothing today needs one.
const LINE_COLORS = [
  { fill: "fill-foreground", stroke: "stroke-foreground" },
  { fill: "fill-tier-heuristic", stroke: "stroke-tier-heuristic" },
];

function linesHtml(lines, bucketCount) {
  return lines.map((series, seriesIndex) => {
    const color = LINE_COLORS[seriesIndex % LINE_COLORS.length];
    const y = lineScale(series.positionOrder);
    const realPoints = series.points
      .map((point, i) => (point ? { ...point, x: bucketCenterX(i, bucketCount), y: y(point.positionKey) } : null))
      .filter(Boolean);

    const pathD = realPoints.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
    const pathHtml = realPoints.length > 1 ? `<path d="${pathD}" fill="none" class="${color.stroke}" stroke-width="2" />` : "";

    const pointsHtml = realPoints.map(p => `
      <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4" class="${color.fill}" />
      <text x="${p.x.toFixed(1)}" y="${(p.y - 10).toFixed(1)}" text-anchor="middle" class="${color.fill} text-[10px] font-bold">${escapeHtml(p.displayLabel)}</text>
    `).join("");

    return pathHtml + pointsHtml;
  }).join("");
}

// Bar-series y-axis: a few horizontal gridlines with numeric tick labels
// (0, midpoint, max) sharing the bars' own barScale. Deliberately NOT
// added to the line series -- grade is ordinal, not linear, and per-point
// grade labels are the intentional design choice there (see this plan's
// own Global Constraints), not an oversight to fix in parallel. Ticks are
// rounded before deduping so e.g. maxValue=1 (0, 0.5->1, 1) collapses to
// two gridlines instead of drawing two overlapping "1" labels.
function barYAxisHtml(maxValue, y) {
  const ticks = [...new Set([0, maxValue / 2, maxValue].map(v => Math.round(v)))];
  return ticks.map(v => {
    const ty = y(v);
    return `
      <line x1="${MARGIN.left}" y1="${ty.toFixed(1)}" x2="${(MARGIN.left + PLOT_WIDTH).toFixed(1)}" y2="${ty.toFixed(1)}" class="stroke-border" stroke-width="1" />
      <text x="${(MARGIN.left - 8).toFixed(1)}" y="${(ty + 3).toFixed(1)}" text-anchor="end" class="fill-muted text-[10px]">${v}</text>
    `;
  }).join("");
}

function xAxisHtml(bucketLabels) {
  return bucketLabels.map((label, i) => {
    const x = bucketCenterX(i, bucketLabels.length);
    return `<text x="${x.toFixed(1)}" y="${(MARGIN.top + PLOT_HEIGHT + 20).toFixed(1)}" text-anchor="middle" class="fill-muted text-[10px]">${escapeHtml(label)}</text>`;
  }).join("");
}

export function renderComboChartHtml({ bucketLabels, bars, lines, headline }) {
  const bucketCount = bucketLabels.length;
  const maxValue = barMaxValue(bars);
  const y = barScale(maxValue);
  return `<div>
    <p class="text-[.95rem] font-semibold text-foreground mb-3">${escapeHtml(headline)}</p>
    <svg viewBox="0 0 ${CHART_WIDTH} ${CHART_HEIGHT}" class="w-full h-auto">
      <line x1="${MARGIN.left}" y1="${MARGIN.top + PLOT_HEIGHT}" x2="${MARGIN.left + PLOT_WIDTH}" y2="${MARGIN.top + PLOT_HEIGHT}" class="stroke-border" stroke-width="1" />
      ${bars.length ? barYAxisHtml(maxValue, y) : ""}
      ${barsHtml(bars, bucketCount, y)}
      ${linesHtml(lines, bucketCount)}
      ${xAxisHtml(bucketLabels)}
    </svg>
  </div>`;
}
