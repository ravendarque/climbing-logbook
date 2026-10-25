import { createAppShell } from "./app-shell.js";
import { escapeHtml } from "./escape-html.js";
import { humanize, MIN_TAG_COUNT } from "../shared/tag-stats-helpers.js";
import { createReportData } from "./report-data.js";
import { buildStrengthsReport } from "../shared/reports.js";
import { startPage } from "./boot-gate.js";
import { insightsHtml } from "./insight-card.js";

const {
  username: USERNAME,
  isDemo,
  store,
  syncStatusIcon,
  headerChrome,
  updateAdminBar,
  authenticateAthlete,
} = createAppShell({ render });
const reportData = createReportData({ username: USERNAME, isDemo, store, syncStatusIcon, onRefresh: loadStrengths });

document.getElementById("back-to-performance-link").href = `/${encodeURIComponent(USERNAME)}/performance`;

const strengthsRootEl = document.getElementById("strengths-root");
const offlineEl = document.getElementById("performance-offline");
let report = null;

function render() {
  headerChrome.updateDisciplinePicker();
  updateAdminBar();
  if (report) renderStrengths(report[store.getActiveType()]);
}

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

function tableHtml(headers, rows) {
  return `<details class="mt-3"><summary class="text-sm font-semibold text-accent-ink cursor-pointer">Show as a table</summary>
    <div class="overflow-x-auto"><table class="w-full mt-2 text-sm tabular-nums">
      <thead><tr>${headers.map(h => `<th class="text-left text-muted font-semibold py-1 pr-2 border-b border-border">${escapeHtml(h)}</th>`).join("")}</tr></thead>
      <tbody>${rows.map(r => `<tr>${r.map(c => `<td class="py-1 pr-2 border-b border-border">${escapeHtml(String(c))}</td>`).join("")}</tr>`).join("")}</tbody>
    </table></div></details>`;
}

function sectionHtml(id, title, intro, body) {
  return `<section class="mt-8" aria-labelledby="${id}">
    <h2 class="section-heading" id="${id}">${escapeHtml(title)}</h2>
    <p class="text-sm text-muted leading-[1.7] mb-3">${escapeHtml(intro)}</p>${body}</section>`;
}

function radarHtml(angles) {
  const cx = 180,
    cy = 165,
    R = 105;
  const levelled = angles.filter(a => a.level);
  const steps = levelled.map(a => a.step);
  const lo = Math.min(...steps) - 2,
    hi = Math.max(...steps) + 1;
  const radius = step => ((step - lo) / (hi - lo)) * R;
  const point = (i, r) => {
    const t = -Math.PI / 2 + (i * 2 * Math.PI) / angles.length;
    return [cx + r * Math.cos(t), cy + r * Math.sin(t)];
  };
  const grid = [0.33, 0.66, 1]
    .map(
      f =>
        `<polygon points="${angles.map((_, i) => point(i, R * f).join(",")).join(" ")}" class="fill-none stroke-border" stroke-width="1"/>`,
    )
    .join("");
  const spokes = angles
    .map((_, i) => {
      const [x, y] = point(i, R);
      return `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" class="stroke-border" stroke-width="1"/>`;
    })
    .join("");
  const shape = angles.map((a, i) => point(i, a.level ? radius(a.step) : 0).join(",")).join(" ");
  const dots = angles
    .map((a, i) => {
      if (!a.level) return "";
      const [x, y] = point(i, radius(a.step));
      return `<circle cx="${x}" cy="${y}" r="5" class="fill-accent stroke-background" stroke-width="2"><title>${escapeHtml(`${humanize(a.angle)}: ${a.level}, ${a.share}% of your climbs`)}</title></circle>`;
    })
    .join("");
  const labels = angles
    .map((a, i) => {
      const [x, y] = point(i, R + 24);
      const anchor = Math.abs(x - cx) < 5 ? "middle" : x > cx ? "start" : "end";
      const grade = a.level ?? "–";
      return `<text x="${x}" y="${y - 3}" text-anchor="${anchor}" class="fill-foreground text-[12px] font-semibold">${escapeHtml(`${humanize(a.angle)} · ${grade}`)}</text>
        <text x="${x}" y="${y + 12}" text-anchor="${anchor}" class="fill-muted text-[11px]">${a.share}% of climbs</text>`;
    })
    .join("");
  const svg = `<svg viewBox="0 0 360 340" class="block w-full max-w-[420px] mx-auto h-auto overflow-visible" role="img" aria-label="Your level on each wall angle">
    ${grid}${spokes}<polygon points="${shape}" class="fill-accent/15 stroke-accent" stroke-width="2" stroke-linejoin="round"/>${dots}${labels}</svg>`;
  return (
    svg +
    tableHtml(
      ["Wall angle", "Your level", "Share of climbs"],
      angles.map(a => [humanize(a.angle), a.level ?? "Not enough sends", `${a.share}%`]),
    )
  );
}

function divergingHtml(items) {
  const mid = 226,
    unit = Math.min(18, 120 / Math.max(...items.flatMap(i => [i.below, i.limit]), 1)),
    h = 22,
    gap = 12,
    top = 24;
  const height = top + items.length * (h + gap);
  const rows = items
    .map((item, i) => {
      const y = top + i * (h + gap);
      const label = `<text x="22" y="${y + h / 2 + 4}" class="fill-foreground text-[12px] font-semibold">${escapeHtml(item.name)}</text>`;
      const below = item.below
        ? `<rect x="${mid - 1 - item.below * unit}" y="${y}" width="${item.below * unit}" height="${h}" rx="4" class="fill-tier-heuristic"><title>${escapeHtml(`${item.name}: ${plural(item.below, "climb")} below your level`)}</title></rect>
           <text x="${mid - 7 - item.below * unit}" y="${y + h / 2 + 4}" text-anchor="end" class="fill-muted text-[11px]">${item.below}</text>`
        : "";
      const limit = item.limit
        ? `<rect x="${mid + 1}" y="${y}" width="${item.limit * unit}" height="${h}" rx="4" class="fill-insight-positive"><title>${escapeHtml(`${item.name}: ${plural(item.limit, "climb")} at your limit`)}</title></rect>
           <text x="${mid + 7 + item.limit * unit}" y="${y + h / 2 + 4}" class="fill-muted text-[11px]">${item.limit}</text>`
        : "";
      return label + below + limit;
    })
    .join("");
  const svg = `<div class="flex flex-wrap gap-4 text-xs text-muted mb-2" aria-hidden="true">
      <span><i class="inline-block w-3 h-3 rounded-[3px] bg-tier-heuristic align-[-1px] mr-1.5"></i>Below your level</span>
      <span><i class="inline-block w-3 h-3 rounded-[3px] bg-insight-positive align-[-1px] mr-1.5"></i>At your limit</span>
    </div>
    <svg viewBox="0 0 360 ${height}" class="block w-full max-w-[520px] h-auto overflow-visible" role="img" aria-label="What makes climbs hard for you">
      <text x="${mid - 6}" y="12" text-anchor="end" class="fill-muted text-[11px]">← below your level</text>
      <text x="${mid + 6}" y="12" class="fill-muted text-[11px]">at your limit →</text>
      ${rows}<line x1="${mid}" y1="${top - 4}" x2="${mid}" y2="${height - gap + 4}" class="stroke-muted" stroke-width="1"/></svg>`;
  return (
    svg +
    tableHtml(
      ["Hold, move or position", "Below your level", "At your limit"],
      items.map(i => [i.name, i.below, i.limit]),
    )
  );
}

function heatHtml(heat, angles) {
  const max = Math.max(...heat.flatMap(r => r.counts), 1);
  const head = `<div></div>${angles.map(a => `<div class="text-xs text-muted font-semibold text-center py-1" role="columnheader">${escapeHtml(humanize(a.angle))}</div>`).join("")}`;
  const rows = heat
    .map(
      row =>
        `<div class="text-sm font-semibold self-center" role="rowheader">${escapeHtml(row.name)}</div>${row.counts
          .map((n, i) => {
            const strong = n / max > 0.5;
            const tint = n ? Math.round(18 + (n / max) * 82) : 0;
            return `<div class="rounded-[4px] text-center py-2 text-sm font-bold ${n ? (strong ? "text-white" : "text-foreground") : "text-muted font-normal"}" role="cell" style="background:${n ? `color-mix(in srgb, var(--color-accent) ${tint}%, var(--color-surface))` : "var(--color-surface)"}" title="${escapeHtml(`${row.name} on ${humanize(angles[i].angle).toLowerCase()}: ${plural(n, "climb")}`)}">${n || "–"}</div>`;
          })
          .join("")}`,
    )
    .join("");
  return `<div class="overflow-x-auto"><div class="grid gap-[3px] min-w-[420px]" style="grid-template-columns:4.6rem repeat(${angles.length},minmax(2.6rem,1fr))" role="table" aria-label="Where your cruxes are">${head}${rows}</div></div>`;
}

function renderStrengths(data) {
  const levelled = data.angles.filter(a => a.level).length;
  const empty = !data.insights.length && levelled < 2 && !data.items.length;
  const intro = `<p class="text-sm text-muted mb-1">${plural(data.climbs, "climb")} with a wall angle, ${data.described} with a hardest move.</p>`;
  if (empty) {
    strengthsRootEl.innerHTML =
      intro +
      insightsHtml([
        {
          tone: "neutral",
          title: "Not enough data yet",
          text: `Patterns show here once you've sent ${MIN_TAG_COUNT} or more climbs on at least two wall angles, or written the hardest move on ${MIN_TAG_COUNT} or more climbs.`,
        },
      ]);
    return;
  }
  strengthsRootEl.innerHTML =
    intro +
    insightsHtml(data.insights) +
    (levelled >= 2
      ? sectionHtml(
          "strengths-angles",
          "Grade by wall angle",
          "How far out each point sits is your level on that angle: the median of your best five sends there. Each label also shows how much of your climbing that angle is.",
          radarHtml(data.angles),
        )
      : "") +
    (data.items.length
      ? sectionHtml(
          "strengths-items",
          "What makes climbs hard for you",
          `Each climb counts once for each thing its hardest move names. Left: the climb was two or more grades under your level on that angle, so it's a weakness. Right: the climb was at your level, so it's just hard climbing. Only things on ${MIN_TAG_COUNT} or more climbs are shown.`,
          divergingHtml(data.items),
        )
      : "") +
    (data.heat.length
      ? sectionHtml(
          "strengths-heat",
          "Where your cruxes are",
          "How many climbs had their hardest move on each hold type, at each angle. Darker means more.",
          heatHtml(data.heat, data.angles),
        )
      : "");
}

async function loadStrengths() {
  try {
    report = await reportData.report("performance/strengths", buildStrengthsReport);
    offlineEl.hidden = true;
    strengthsRootEl.hidden = false;
    renderStrengths(report[store.getActiveType()]);
  } catch {
    offlineEl.hidden = false;
    strengthsRootEl.hidden = true;
  }
}

async function boot() {
  if (!(await authenticateAthlete("performance-strengths"))) return;
  if (!(await reportData.open())) return;

  render();
  await loadStrengths();
  reportData.refresh();
}

startPage(boot);
