// A pure string generator, so its tests need no DOM.
import { escapeHtml } from "./escape-html.js";

const CHART_WIDTH = 640;
const CHART_HEIGHT = 320;
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

function barScale(maxValue) {
  const safeMax = Math.max(1, maxValue) * 1.25;
  return v => MARGIN.top + PLOT_HEIGHT - (v / safeMax) * PLOT_HEIGHT;
}

function barMaxValue(bars) {
  return Math.max(0, ...bars.flatMap(b => b.values.filter(v => v !== null)));
}

function barsHtml(bars, bucketCount, y) {
  const slotWidth = PLOT_WIDTH / bucketCount;
  const groupWidth = slotWidth * 0.6;
  const barWidth = groupWidth / bars.length;
  const barBottom = MARGIN.top + PLOT_HEIGHT;

  return bars.map((series, seriesIndex) => series.values.map((value, bucketIndex) => {
    const slotStart = bucketSlotX(bucketIndex, bucketCount) + (slotWidth - groupWidth) / 2;
    const x = slotStart + barWidth * seriesIndex;
    const labelX = (x + barWidth * 0.425).toFixed(1);

    // null is "not recorded": no bar, and a dash rather than 0.
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

// Complete literal class names: Tailwind only generates classes it finds verbatim in source.
// No blue: it isn't in the palette.
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

// No y-axis for lines: grade is ordinal, so each point carries its own label.
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
      <rect x="${MARGIN.left}" y="${MARGIN.top}" width="${PLOT_WIDTH}" height="${PLOT_HEIGHT}" class="fill-none stroke-border" stroke-width="1" />
      <line x1="${MARGIN.left}" y1="${MARGIN.top + PLOT_HEIGHT}" x2="${MARGIN.left + PLOT_WIDTH}" y2="${MARGIN.top + PLOT_HEIGHT}" class="stroke-border" stroke-width="1" />
      ${bars.length ? barYAxisHtml(maxValue, y) : ""}
      ${barsHtml(bars, bucketCount, y)}
      ${linesHtml(lines, bucketCount)}
      ${xAxisHtml(bucketLabels)}
    </svg>
  </div>`;
}
