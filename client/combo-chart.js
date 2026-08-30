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
const MARGIN = { top: 24, right: 20, bottom: 40, left: 20 };
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

function barsHtml(bars, bucketCount) {
  const maxValue = Math.max(0, ...bars.flatMap(b => b.values));
  const y = barScale(maxValue);
  const slotWidth = PLOT_WIDTH / bucketCount;
  // Each bar series gets its own sub-slot within the bucket, side by
  // side (grouped bars), not stacked -- #15 only ever has one bar series
  // in practice, but the component stays genuinely N-series per the
  // design doc's own "N bars" requirement, not hardcoded to one.
  const groupWidth = slotWidth * 0.6;
  const barWidth = groupWidth / bars.length;

  return bars.map((series, seriesIndex) => series.values.map((value, bucketIndex) => {
    const slotStart = bucketSlotX(bucketIndex, bucketCount) + (slotWidth - groupWidth) / 2;
    const x = slotStart + barWidth * seriesIndex;
    const barTop = y(value);
    const barBottom = MARGIN.top + PLOT_HEIGHT;
    const height = Math.max(0, barBottom - barTop);
    return `
      <rect x="${x.toFixed(1)}" y="${barTop.toFixed(1)}" width="${(barWidth * 0.85).toFixed(1)}" height="${height.toFixed(1)}" class="fill-accent" />
      <text x="${(x + barWidth * 0.425).toFixed(1)}" y="${(barTop - 6).toFixed(1)}" text-anchor="middle" class="fill-foreground text-[10px]">${escapeHtml(String(value))}</text>
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

function linesHtml(lines, bucketCount) {
  return lines.map(series => {
    const y = lineScale(series.positionOrder);
    const realPoints = series.points
      .map((point, i) => (point ? { ...point, x: bucketCenterX(i, bucketCount), y: y(point.positionKey) } : null))
      .filter(Boolean);

    const pathD = realPoints.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
    const pathHtml = realPoints.length > 1 ? `<path d="${pathD}" fill="none" class="stroke-foreground" stroke-width="2" />` : "";

    const pointsHtml = realPoints.map(p => `
      <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4" class="fill-foreground" />
      <text x="${p.x.toFixed(1)}" y="${(p.y - 10).toFixed(1)}" text-anchor="middle" class="fill-foreground text-[10px] font-bold">${escapeHtml(p.displayLabel)}</text>
    `).join("");

    return pathHtml + pointsHtml;
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
  return `<div>
    <p class="text-[.95rem] font-semibold text-foreground mb-3">${escapeHtml(headline)}</p>
    <svg viewBox="0 0 ${CHART_WIDTH} ${CHART_HEIGHT}" class="w-full h-auto">
      <line x1="${MARGIN.left}" y1="${MARGIN.top + PLOT_HEIGHT}" x2="${MARGIN.left + PLOT_WIDTH}" y2="${MARGIN.top + PLOT_HEIGHT}" class="stroke-border" stroke-width="1" />
      ${barsHtml(bars, bucketCount)}
      ${linesHtml(lines, bucketCount)}
      ${xAxisHtml(bucketLabels)}
    </svg>
  </div>`;
}
