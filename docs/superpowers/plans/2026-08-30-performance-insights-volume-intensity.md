# Performance Insights: Volume/Intensity Trend (#15) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `/:username/performance/trends` — a compound bar+line chart (sends per month as bars, max grade sent per month as a line with grade-text point labels) over a selectable time window — the fourth of epic #5's five remaining Phase 2 views, and the first to need the shared combo-chart and shared time-window infrastructure.

**Architecture:** Two genuinely new, generically-scoped `client/*.js` modules built as part of this deliverable (matching how #575 built `client/row-card.js` and #584 built `client/move-tagging.js` as first-consumer deliverables, not speculative upfront infrastructure): `client/combo-chart.js` (a pure SVG-string generator — no DOM dependency, testable with plain Vitest, no `happy-dom` needed) and `client/time-window.js` (a real interactive DOM controller — the segmented 3mo/12mo/Custom pill, needs `happy-dom` for its own tests, reusing the `client-dom` Vitest project #584 already set up). Server-side aggregation (`shared/volume-stats.js`, mirroring `shared/pyramid-stats.js`'s precedent) computed in a new `handleGetVolume` handler (`server/api/performance.js`, alongside the three existing handlers there). A new composition root (`client/performance-trends-main.js`) follows `client/performance-strengths-main.js`'s exact boot/render/redirect pattern, plus a discipline-switch re-render (matching `client/performance-pyramid-main.js`'s own instant-switch-no-refetch precedent).

**Tech Stack:** Cloudflare Workers + D1, Vitest (`happy-dom` for the time-window control's own tests), Playwright, esbuild, Tailwind v4, hand-rolled SVG (no charting library — #569, resolved).

**Spec:** `docs/superpowers/specs/2026-08-27-performance-insights-ui-design.md` — "Chart legibility principles", "Shared time-window control", "Shared combo-chart component", and "#15 volume & intensity: interaction design" sections. Also `docs/climbing-analytics-research.md` §6 and issue #15's own GitHub body (both consistent with the spec doc).

## Global Constraints

- **Route is `/performance/trends`**, not `/performance/volume` — matches the design doc's own Routes table (`| /performance/trends | Volume/intensity trend (#15) | new |`), which this plan's own grounding pass confirmed by re-reading that table fresh. The API endpoint is named `/logbook/api/performance/volume` (the data concept, not the URL slug — server-side route names in this codebase don't have to match the page slug, e.g. `handleGetPyramid` serves `/performance/pyramid`'s data at `/logbook/api/performance/pyramid`, a slug match there, but `handleGetStrengthsWeaknesses` serves `/performance/strengths` — this plan keeps the API path as `/logbook/api/performance/volume` since "volume" is this view's own internal concept name throughout the design doc's own prose ("Volume/intensity trend view"), while the page slug `trends` is the Routes table's own literal choice).
- **Both `client/combo-chart.js` and `client/time-window.js` live in `client/`, not `shared/`.** The design doc's own comparison point for both ("same implementation granularity as the shared card component") is `client/row-card.js` (#575), which lives in `client/`, not `shared/` — matching that precedent exactly, not the `shared/*.js` pure-aggregation-module precedent (`shared/pyramid-stats.js` etc.), which is a different kind of module (computed server-side too; the chart/time-window modules are never needed server-side at all).
- **`client/combo-chart.js` is a pure string-generator with no DOM dependency** — `renderComboChartHtml(options) => string` (SVG markup as a string), assigned to a container's `innerHTML` by the caller, same `innerHTML = templateString` convention every other `client/*.js` module in this codebase already uses. This means its own tests run on the existing "workers" Vitest project (plain `pnpm exec vitest run`, no `happy-dom` needed) — a real, notable property worth preserving, not incidental.
- **`client/time-window.js` needs a real DOM** (button clicks, native date inputs, live active-mode state) — its test file goes in `vitest.config.js`'s existing `client-dom` project (the one #584's `client/move-tagging.js` already established), which needs extending: add the new test file's path to both the `client-dom` project's `include` list and the `workers` project's `exclude` list, matching that project's own established two-list pattern exactly.
- **Sends only, both series** — matches `shared/pyramid-stats.js`'s own already-established "sends only" scoping for this exact kind of aggregate (`status === "send"`), not every logged attempt/project. Both the bar series (send count per month) and the line series (max grade sent per month) are scoped this way — keeps the two series describing the same underlying population, consistent with the design doc's own "climbs logged" and "max grade sent" both referring to the same completed-sends concept, not two different populations.
- **Ruling — bucket granularity is always monthly**, regardless of the selected window's length (3 buckets for `3mo`, 12 for `12mo`, however many months a `Custom` range spans). The design doc doesn't pin an exact granularity; monthly is the simplest option that produces a legible chart at both ends of the fixed presets (3 points is sparse but real for `3mo`, 12 points is clean for `12mo`) without building adaptive-granularity logic YAGNI would reject.
- **Ruling — the time-window control's `Custom` mode uses two native `<input type="date">` fields** (start/end), not a hand-built calendar widget — this app's entry form already establishes the exact same "native date input behind a button" pattern (`client/entry-form.js`'s `date-picker-btn`/`date-native`), and building a bespoke calendar UI here would be real, unwarranted scope beyond what the design doc actually specifies ("a real range picker for anything finer" — a real range picker, not a custom-built one).
- **Ruling — the combo-chart's line series decouple position from display label.** A `points` entry is `{ positionKey, displayLabel } | null`, not a bare string — boulder's V-grade display text (`V4`, `V5`, per the design doc's own literal example) is not 1:1 with its internal grade codes (`5B`/`5C` both display as `V1`/`V2` individually but are genuinely different grades), so the chart needs the real internal code for correct vertical positioning (`positionKey`) while showing the friendlier V-grade text (`displayLabel`) — using the display label for both would silently misposition points that share a V-grade label but aren't the same grade.
- **Confidence-gate concept from #13/#39 does NOT apply here.** This view is a straightforward time-bucketed count/max aggregation, not a tag-frequency ranking — there is no `MIN_TAG_COUNT`-style threshold to import or reinvent; an empty bucket is just zero, not "not enough data yet."
- **`entries.deleted_at IS NULL` filtering is already handled for free** — `listForUser(env, "entries", userId, rowToJson, {excludeDeleted: true})`, the same call every other `performance.js` handler already makes.
- **Security**: per this epic's own established pattern (a public-endpoint leak in #584/#585, a missing-test gap in #39, both caught and fixed by explicit checks in every deliverable since), this plan's new endpoint's task includes anonymous-caller and cross-user-isolation tests from the start, and the final review re-verifies `server/api/public-data.js` has no route to it.
- **Test commands**: `pnpm test` (Vitest), `pnpm exec playwright test` (Playwright, run twice for idempotency).
- **Deploy classification: beta-only, no migrations touched.** Per Raven's explicit instruction this session, do **not** run `promote.yml` after merge — leave this on beta same as the prior three deliverables in this epic.

---

## Task 1: `client/combo-chart.js` — the shared SVG combo-chart string generator

**Files:**
- Create: `client/combo-chart.js`
- Test: `test/client/combo-chart.test.js` (on the existing "workers" Vitest project — this module has no DOM dependency, confirm your test file does NOT need any `vitest.config.js` change)

**Interfaces:**
- Consumes: nothing from other tasks (this is genuinely reusable, standalone infrastructure — #14 and #38, not part of this plan, will import it directly once their own turn comes).
- Produces: `renderComboChartHtml({ bucketLabels, bars, lines, headline })` → an SVG markup string (a `<div>` wrapper containing the headline `<p>` and an `<svg>` element), where `bucketLabels: string[]`, `bars: Array<{ label: string, values: number[] }>`, `lines: Array<{ label: string, points: Array<{positionKey: string, displayLabel: string} | null>, positionOrder: string[] }>`, `headline: string`.

- [ ] **Step 1: Write the failing tests**

Create `test/client/combo-chart.test.js`:

```js
import { describe, expect, it } from "vitest";
import { renderComboChartHtml } from "../../client/combo-chart.js";

describe("renderComboChartHtml", () => {
  it("renders the headline sentence", () => {
    const html = renderComboChartHtml({ bucketLabels: ["Jan 2026"], bars: [{ label: "Sends", values: [3] }], lines: [], headline: "3 sends this month." });
    expect(html).toContain("3 sends this month.");
  });

  it("renders one <rect> per bar value", () => {
    const html = renderComboChartHtml({ bucketLabels: ["Jan 2026", "Feb 2026"], bars: [{ label: "Sends", values: [3, 5] }], lines: [], headline: "h" });
    const rectCount = (html.match(/<rect/g) || []).length;
    expect(rectCount).toBe(2);
  });

  it("renders a taller bar for a larger value", () => {
    const html = renderComboChartHtml({ bucketLabels: ["Jan 2026", "Feb 2026"], bars: [{ label: "Sends", values: [2, 8] }], lines: [], headline: "h" });
    const heights = [...html.matchAll(/<rect[^>]*height="([\d.]+)"/g)].map(m => Number(m[1]));
    expect(heights).toHaveLength(2);
    expect(heights[1]).toBeGreaterThan(heights[0]);
  });

  it("renders a numeric data label on each bar", () => {
    const html = renderComboChartHtml({ bucketLabels: ["Jan 2026"], bars: [{ label: "Sends", values: [7] }], lines: [], headline: "h" });
    expect(html).toContain(">7<");
  });

  it("renders every bucket label on the x-axis", () => {
    const html = renderComboChartHtml({ bucketLabels: ["Jan 2026", "Feb 2026", "Mar 2026"], bars: [{ label: "Sends", values: [1, 2, 3] }], lines: [], headline: "h" });
    expect(html).toContain("Jan 2026");
    expect(html).toContain("Feb 2026");
    expect(html).toContain("Mar 2026");
  });

  it("renders a line point's display label, not its position key", () => {
    const html = renderComboChartHtml({
      bucketLabels: ["Jan 2026"],
      bars: [{ label: "Sends", values: [1] }],
      lines: [{ label: "Max grade", points: [{ positionKey: "6B", displayLabel: "V4" }], positionOrder: ["5", "6A", "6B", "6C"] }],
      headline: "h",
    });
    expect(html).toContain(">V4<");
    expect(html).not.toContain(">6B<");
  });

  it("positions a higher positionOrder index visually higher (smaller SVG y)", () => {
    const html = renderComboChartHtml({
      bucketLabels: ["Jan 2026", "Feb 2026"],
      bars: [{ label: "Sends", values: [1, 1] }],
      lines: [{
        label: "Max grade",
        points: [{ positionKey: "5", displayLabel: "V0" }, { positionKey: "6C", displayLabel: "V5" }],
        positionOrder: ["5", "6A", "6B", "6C"],
      }],
      headline: "h",
    });
    const circles = [...html.matchAll(/<circle[^>]*cy="([\d.]+)"/g)].map(m => Number(m[1]));
    expect(circles).toHaveLength(2);
    expect(circles[1]).toBeLessThan(circles[0]); // "6C" (index 3) is higher on the chart than "5" (index 0) -- smaller SVG y
  });

  it("skips a null point in a line series without throwing", () => {
    const html = renderComboChartHtml({
      bucketLabels: ["Jan 2026", "Feb 2026"],
      bars: [{ label: "Sends", values: [0, 1] }],
      lines: [{ label: "Max grade", points: [null, { positionKey: "6A", displayLabel: "V3" }], positionOrder: ["5", "6A"] }],
      headline: "h",
    });
    const circleCount = (html.match(/<circle/g) || []).length;
    expect(circleCount).toBe(1);
  });

  it("handles an all-zero bar series without dividing by zero", () => {
    expect(() => renderComboChartHtml({ bucketLabels: ["Jan 2026"], bars: [{ label: "Sends", values: [0] }], lines: [], headline: "h" })).not.toThrow();
  });

  it("handles a positionOrder of length 1 without dividing by zero", () => {
    const html = renderComboChartHtml({
      bucketLabels: ["Jan 2026"],
      bars: [{ label: "Sends", values: [1] }],
      lines: [{ label: "Max grade", points: [{ positionKey: "6A", displayLabel: "V3" }], positionOrder: ["6A"] }],
      headline: "h",
    });
    expect(html).toContain(">V3<");
  });

  it("renders multiple bar series side by side within the same bucket slot, not stacked", () => {
    const html = renderComboChartHtml({
      bucketLabels: ["Jan 2026"],
      bars: [{ label: "A", values: [3] }, { label: "B", values: [5] }],
      lines: [],
      headline: "h",
    });
    const xs = [...html.matchAll(/<rect[^>]*x="([\d.]+)"/g)].map(m => Number(m[1]));
    expect(xs).toHaveLength(2);
    expect(xs[0]).not.toBe(xs[1]);
  });
});
```

- [ ] **Step 2: Run the tests, confirm they fail**

Run: `pnpm exec vitest run test/client/combo-chart.test.js`
Expected: FAIL — `client/combo-chart.js` doesn't exist yet.

- [ ] **Step 3: Implement `client/combo-chart.js`**

```js
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
```

- [ ] **Step 4: Run the tests, confirm they pass**

Run: `pnpm exec vitest run test/client/combo-chart.test.js`
Expected: PASS (11 tests)

- [ ] **Step 5: Run the full suite to confirm no regressions**

Run: `pnpm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add client/combo-chart.js test/client/combo-chart.test.js
git commit -m "Add client/combo-chart.js: shared hand-rolled SVG bar+line chart"
```

---

## Task 2: `client/time-window.js` — the shared segmented time-window control

**Files:**
- Create: `client/time-window.js`
- Test: `test/client/time-window.test.js`
- Modify: `vitest.config.js` (extend the `client-dom` project's `include` and the `workers` project's `exclude`)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `createTimeWindowControl({ containerEl, onChange, initial = "3mo" })` → renders the pill control (and, when `Custom` is active, two native date inputs) into `containerEl`, calling `onChange({ start, end })` (both `"YYYY-MM-DD"` strings) once immediately on creation and again every time the effective range changes. Returns `{ getRange: () => ({start, end}) }`.

- [ ] **Step 1: Write the failing tests**

Create `test/client/time-window.test.js`:

```js
// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTimeWindowControl } from "../../client/time-window.js";

let containerEl;

beforeEach(() => {
  document.body.innerHTML = `<div id="container"></div>`;
  containerEl = document.getElementById("container");
});

describe("createTimeWindowControl", () => {
  it("calls onChange immediately with the initial 3mo range", () => {
    const onChange = vi.fn();
    createTimeWindowControl({ containerEl, onChange, initial: "3mo" });
    expect(onChange).toHaveBeenCalledTimes(1);
    const { start, end } = onChange.mock.calls[0][0];
    expect(start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(end).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(new Date(start).getTime()).toBeLessThan(new Date(end).getTime());
  });

  it("renders three pill buttons: 3mo, 12mo, Custom", () => {
    createTimeWindowControl({ containerEl, onChange: () => {} });
    expect(containerEl.querySelector('[data-window="3mo"]')).toBeTruthy();
    expect(containerEl.querySelector('[data-window="12mo"]')).toBeTruthy();
    expect(containerEl.querySelector('[data-window="custom"]')).toBeTruthy();
  });

  it("switching to 12mo produces a wider range than 3mo and fires onChange again", () => {
    const onChange = vi.fn();
    createTimeWindowControl({ containerEl, onChange, initial: "3mo" });
    containerEl.querySelector('[data-window="12mo"]').click();
    expect(onChange).toHaveBeenCalledTimes(2);
    const { start: start3mo } = onChange.mock.calls[0][0];
    const { start: start12mo } = onChange.mock.calls[1][0];
    expect(new Date(start12mo).getTime()).toBeLessThan(new Date(start3mo).getTime());
  });

  it("switching to Custom reveals two native date inputs, not present before", () => {
    createTimeWindowControl({ containerEl, onChange: () => {} });
    expect(containerEl.querySelector('input[type="date"]')).toBeFalsy();
    containerEl.querySelector('[data-window="custom"]').click();
    const dateInputs = containerEl.querySelectorAll('input[type="date"]');
    expect(dateInputs).toHaveLength(2);
  });

  it("changing both custom date inputs fires onChange with the chosen range", () => {
    const onChange = vi.fn();
    createTimeWindowControl({ containerEl, onChange });
    containerEl.querySelector('[data-window="custom"]').click();
    const [startInput, endInput] = containerEl.querySelectorAll('input[type="date"]');
    startInput.value = "2026-01-01";
    startInput.dispatchEvent(new Event("change", { bubbles: true }));
    endInput.value = "2026-02-15";
    endInput.dispatchEvent(new Event("change", { bubbles: true }));
    const last = onChange.mock.calls.at(-1)[0];
    expect(last).toEqual({ start: "2026-01-01", end: "2026-02-15" });
  });

  it("getRange() returns the currently active range", () => {
    const control = createTimeWindowControl({ containerEl, onChange: () => {}, initial: "3mo" });
    const { start, end } = control.getRange();
    expect(start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(end).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
```

- [ ] **Step 2: Run the tests, confirm they fail**

Run: `pnpm exec vitest run test/client/time-window.test.js`
Expected: FAIL — `client/time-window.js` doesn't exist, and the test file isn't wired into a DOM-capable Vitest project yet.

- [ ] **Step 3: Extend `vitest.config.js`**

Add `test/client/time-window.test.js` to the `client-dom` project's `include` array (alongside the existing `test/client/move-tagging.test.js`) and to the `workers` project's `exclude` array (same two-place pattern already established there):

```js
          include: ["test/**/*.test.js"],
          exclude: ["test/client/move-tagging.test.js", "test/client/time-window.test.js"],
```

```js
          include: ["test/client/move-tagging.test.js", "test/client/time-window.test.js"],
          environment: "happy-dom",
```

- [ ] **Step 4: Implement `client/time-window.js`**

```js
// Shared time-window control (#15, epic #5 Phase 2) -- a segmented pill
// (3mo / 12mo / Custom), same implementation granularity as client/
// combo-chart.js and client/row-card.js (a plain JS module, not a Custom
// Element). Custom reveals two native date inputs -- same pattern client/
// entry-form.js's own date-picker-btn/date-native already establishes,
// not a hand-built calendar widget.
function toISODate(date) {
  return date.toISOString().slice(0, 10);
}

function presetRange(preset) {
  const end = new Date();
  const start = new Date(end);
  if (preset === "3mo") start.setUTCMonth(start.getUTCMonth() - 3);
  else if (preset === "12mo") start.setUTCMonth(start.getUTCMonth() - 12);
  return { start: toISODate(start), end: toISODate(end) };
}

const PILL_LABELS = { "3mo": "3 months", "12mo": "12 months", custom: "Custom" };

export function createTimeWindowControl({ containerEl, onChange, initial = "3mo" }) {
  let mode = initial;
  let customRange = presetRange("3mo");

  function currentRange() {
    return mode === "custom" ? customRange : presetRange(mode);
  }

  function render() {
    const pillsHtml = ["3mo", "12mo", "custom"].map(m => `
      <button type="button" class="toggle-btn px-3 py-1 text-[.82rem]" data-window="${m}" aria-pressed="${m === mode}">${PILL_LABELS[m]}</button>
    `).join("");

    const customHtml = mode === "custom"
      ? `<div class="flex gap-2 mt-2">
          <input type="date" class="bg-surface border border-border rounded-app px-2 py-1 text-[.85rem]" id="time-window-start" value="${customRange.start}">
          <input type="date" class="bg-surface border border-border rounded-app px-2 py-1 text-[.85rem]" id="time-window-end" value="${customRange.end}">
        </div>`
      : "";

    containerEl.innerHTML = `<div class="flex gap-1">${pillsHtml}</div>${customHtml}`;

    for (const btn of containerEl.querySelectorAll("[data-window]")) {
      btn.addEventListener("click", () => {
        mode = btn.dataset.window;
        if (mode === "custom") customRange = presetRange("3mo");
        render();
        onChange(currentRange());
      });
    }

    if (mode === "custom") {
      const startInput = containerEl.querySelector("#time-window-start");
      const endInput = containerEl.querySelector("#time-window-end");
      const onCustomChange = () => {
        customRange = { start: startInput.value, end: endInput.value };
        onChange(currentRange());
      };
      startInput.addEventListener("change", onCustomChange);
      endInput.addEventListener("change", onCustomChange);
    }
  }

  render();
  onChange(currentRange());

  return { getRange: currentRange };
}
```

- [ ] **Step 5: Run the tests, confirm they pass**

Run: `pnpm exec vitest run test/client/time-window.test.js`
Expected: PASS (6 tests)

- [ ] **Step 6: Run the full suite to confirm no regressions**

Run: `pnpm test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add client/time-window.js test/client/time-window.test.js vitest.config.js
git commit -m "Add client/time-window.js: shared 3mo/12mo/Custom segmented control"
```

---

## Task 3: `shared/volume-stats.js` — pure time-bucketing/aggregation logic

**Files:**
- Create: `shared/volume-stats.js`
- Test: `test/shared/volume-stats.test.js`

**Interfaces:**
- Consumes: `shared/grade-data.js`'s `gradeRank`, `BOULDER_GRADES`, `LEAD_GRADES` (already exist), `shared/date-helpers.js`'s `formatDate` (already exists, moved here in `#39`).
- Produces: `monthBuckets(start, end)` → `string[]` (`"YYYY-MM"` values, chronological, inclusive of both months). `bucketLabel(yearMonth)` → `string` (e.g. `"Jan 2026"`, via `formatDate`). `volumeByBucket(entries, buckets)` → `{ sendCounts: number[], maxGradeByBucket: Array<string|null> }` (raw internal grade codes, not display labels). `gradeDisplayLabel(grade, type)` → `string` (V-grade for boulder, raw grade for lead). `volumeHeadline(sendCounts)` → `string`.

- [ ] **Step 1: Write the failing tests**

Create `test/shared/volume-stats.test.js`:

```js
import { describe, expect, it } from "vitest";
import { bucketLabel, gradeDisplayLabel, monthBuckets, volumeByBucket, volumeHeadline } from "../../shared/volume-stats.js";

function entry(overrides = {}) {
  return { date: "2026-01-15", status: "send", grade: "6B", type: "boulder", ...overrides };
}

describe("monthBuckets", () => {
  it("returns a single bucket when start and end are in the same month", () => {
    expect(monthBuckets("2026-01-05", "2026-01-28")).toEqual(["2026-01"]);
  });

  it("returns one bucket per month, inclusive of both ends", () => {
    expect(monthBuckets("2026-01-10", "2026-03-20")).toEqual(["2026-01", "2026-02", "2026-03"]);
  });

  it("handles a range spanning a year boundary", () => {
    expect(monthBuckets("2025-11-01", "2026-02-01")).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });
});

describe("bucketLabel", () => {
  it("formats a YYYY-MM bucket as 'Mon YYYY'", () => {
    expect(bucketLabel("2026-01")).toBe("Jan 2026");
  });
});

describe("volumeByBucket", () => {
  it("counts only sends, ignoring other statuses", () => {
    const entries = [entry({ status: "send" }), entry({ status: "project" })];
    const { sendCounts } = volumeByBucket(entries, ["2026-01"]);
    expect(sendCounts).toEqual([1]);
  });

  it("counts multiple sends in the same bucket", () => {
    const entries = [entry(), entry({ date: "2026-01-20" })];
    const { sendCounts } = volumeByBucket(entries, ["2026-01"]);
    expect(sendCounts).toEqual([2]);
  });

  it("ignores an entry whose date falls outside every given bucket", () => {
    const entries = [entry({ date: "2025-06-01" })];
    const { sendCounts } = volumeByBucket(entries, ["2026-01"]);
    expect(sendCounts).toEqual([0]);
  });

  it("ignores an entry with no date", () => {
    const entries = [entry({ date: null })];
    const { sendCounts } = volumeByBucket(entries, ["2026-01"]);
    expect(sendCounts).toEqual([0]);
  });

  it("tracks the highest-ranked grade sent per bucket", () => {
    const entries = [entry({ grade: "6B" }), entry({ grade: "7A", date: "2026-01-20" })];
    const { maxGradeByBucket } = volumeByBucket(entries, ["2026-01"]);
    expect(maxGradeByBucket).toEqual(["7A"]);
  });

  it("returns null for a bucket with no sends", () => {
    const { maxGradeByBucket } = volumeByBucket([], ["2026-01"]);
    expect(maxGradeByBucket).toEqual([null]);
  });

  it("places each entry in its own correct bucket across multiple buckets", () => {
    const entries = [entry({ date: "2026-01-05" }), entry({ date: "2026-02-10", grade: "7A" })];
    const { sendCounts, maxGradeByBucket } = volumeByBucket(entries, ["2026-01", "2026-02"]);
    expect(sendCounts).toEqual([1, 1]);
    expect(maxGradeByBucket).toEqual(["6B", "7A"]);
  });
});

describe("gradeDisplayLabel", () => {
  it("shows the V-grade for a boulder grade", () => {
    expect(gradeDisplayLabel("6B", "boulder")).toBe("V4");
  });

  it("shows the raw grade text for a lead grade (no V-grade concept)", () => {
    expect(gradeDisplayLabel("6a", "lead")).toBe("6a");
  });
});

describe("volumeHeadline", () => {
  it("reports zero sends when every bucket is empty", () => {
    expect(volumeHeadline([0, 0, 0])).toBe("No sends logged in this window yet.");
  });

  it("reports the total and busiest-month count", () => {
    expect(volumeHeadline([2, 5, 1])).toBe("8 sends logged in this window, busiest month had 5.");
  });

  it("uses singular 'send' for a total of exactly 1", () => {
    expect(volumeHeadline([1, 0, 0])).toBe("1 send logged in this window, busiest month had 1.");
  });
});
```

- [ ] **Step 2: Run the tests, confirm they fail**

Run: `pnpm exec vitest run test/shared/volume-stats.test.js`
Expected: FAIL — `shared/volume-stats.js` doesn't exist yet.

- [ ] **Step 3: Implement `shared/volume-stats.js`**

```js
// #15 (epic #5 Phase 2) -- pure, DOM-free time-bucketing/aggregation over
// entries data, computed server-side (server/api/performance.js) same
// "online-only" convention as shared/pyramid-stats.js/shared/injury-
// stats.js/shared/strengths-stats.js. Sends only -- same scoping
// shared/pyramid-stats.js's own pyramidCounts() already applies for this
// exact kind of aggregate.
import { BOULDER_GRADES, LEAD_GRADES, gradeRank } from "./grade-data.js";
import { formatDate } from "./date-helpers.js";

// Monthly buckets, always -- see this plan's own Global Constraints
// ruling on why (simplest option that stays legible across the whole
// 3mo..Custom window-length range, no adaptive-granularity logic).
export function monthBuckets(start, end) {
  const buckets = [];
  const cursor = new Date(`${start.slice(0, 7)}-01T00:00:00Z`);
  const endMonth = new Date(`${end.slice(0, 7)}-01T00:00:00Z`);
  while (cursor <= endMonth) {
    buckets.push(cursor.toISOString().slice(0, 7));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return buckets;
}

// formatDate already handles a bare "YYYY-MM" string as "Mon YYYY" --
// confirmed against its own real implementation (shared/date-helpers.js),
// no new formatting logic needed here.
export function bucketLabel(yearMonth) {
  return formatDate(yearMonth);
}

export function volumeByBucket(entries, buckets) {
  const bucketIndex = Object.fromEntries(buckets.map((b, i) => [b, i]));
  const sendCounts = buckets.map(() => 0);
  const maxGradeByBucket = buckets.map(() => null);

  for (const entry of entries) {
    if (entry.status !== "send" || !entry.date) continue;
    const yearMonth = entry.date.slice(0, 7);
    const idx = bucketIndex[yearMonth];
    if (idx === undefined) continue;
    sendCounts[idx]++;
    if (maxGradeByBucket[idx] === null || gradeRank(entry.grade) > gradeRank(maxGradeByBucket[idx])) {
      maxGradeByBucket[idx] = entry.grade;
    }
  }

  return { sendCounts, maxGradeByBucket };
}

// Boulder's V-grade text isn't 1:1 with its internal grade codes (e.g.
// both "5B" and "5C" display as "V1"/"V2" individually but are genuinely
// different grades) -- this is display-only; positioning a chart point
// correctly still needs the real internal code (see client/combo-
// chart.js's own positionKey/displayLabel split, this plan's own Global
// Constraints ruling).
export function gradeDisplayLabel(grade, type) {
  if (type !== "boulder") return grade;
  const hit = BOULDER_GRADES.find(x => x.g.toUpperCase() === String(grade).toUpperCase());
  return hit ? hit.v : grade;
}

export function volumeHeadline(sendCounts) {
  const total = sendCounts.reduce((a, b) => a + b, 0);
  if (total === 0) return "No sends logged in this window yet.";
  const busiest = Math.max(...sendCounts);
  return `${total} send${total === 1 ? "" : "s"} logged in this window, busiest month had ${busiest}.`;
}
```

- [ ] **Step 4: Run the tests, confirm they pass**

Run: `pnpm exec vitest run test/shared/volume-stats.test.js`
Expected: PASS (16 tests)

- [ ] **Step 5: Run the full suite to confirm no regressions**

Run: `pnpm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add shared/volume-stats.js test/shared/volume-stats.test.js
git commit -m "Add shared/volume-stats.js: monthly send-count + max-grade bucketing"
```

---

## Task 4: `server/api/performance.js` — the volume endpoint

**Files:**
- Modify: `server/api/performance.js`
- Modify: `server/index.js` (route registration)
- Test: `test/performance.test.js` (existing file — add a new `describe("handleGetVolume", ...)` block alongside the three existing ones)

**Interfaces:**
- Consumes: Task 3's `shared/volume-stats.js` (`monthBuckets`, `volumeByBucket`).
- Produces: `handleGetVolume(request, env, userId)` → `{ boulder: { buckets: string[], sendCounts: number[], maxGradeByBucket: Array<string|null> }, lead: {...} }` for `?start=YYYY-MM-DD&end=YYYY-MM-DD` (both required; missing/invalid → 400). Registered at `/logbook/api/performance/volume` in `server/index.js`'s `PUBLIC_GET_ROUTES`.

- [ ] **Step 1: Write the failing tests**

Append to `test/performance.test.js`, after the existing `describe("handleGetStrengthsWeaknesses", ...)` block:

```js
const VOLUME_URL = "/logbook/api/performance/volume";
function getVolume(params, extraCookie = cookie) {
  const qs = new URLSearchParams(params).toString();
  return fetchJson(`${VOLUME_URL}?${qs}`, { headers: { Cookie: extraCookie } });
}

describe("handleGetVolume", () => {
  it("returns 400 when start or end is missing", async () => {
    expect((await getVolume({ end: "2026-03-01" })).status).toBe(400);
    expect((await getVolume({ start: "2026-01-01" })).status).toBe(400);
  });

  it("returns empty per-bucket data for a user with no sends in the window", async () => {
    await postEntry({ date: "2020-01-01" }); // outside the window
    const { boulder } = await (await getVolume({ start: "2026-01-01", end: "2026-03-01" })).json();
    expect(boulder.buckets).toEqual(["2026-01", "2026-02", "2026-03"]);
    expect(boulder.sendCounts).toEqual([0, 0, 0]);
  });

  it("reflects real sends within the window, split by discipline", async () => {
    await postEntry({ type: "boulder", grade: "6B", date: "2026-02-10" });
    await postEntry({ type: "lead", grade: "6a", date: "2026-02-15" });
    const body = await (await getVolume({ start: "2026-01-01", end: "2026-03-01" })).json();
    expect(body.boulder.sendCounts).toEqual([0, 1, 0]);
    expect(body.lead.sendCounts).toEqual([0, 1, 0]);
  });

  it("excludes a soft-deleted entry", async () => {
    const created = await (await postEntry({ date: "2026-02-10" })).json();
    await del(created.entries[0].id);
    const { boulder } = await (await getVolume({ start: "2026-01-01", end: "2026-03-01" })).json();
    expect(boulder.sendCounts).toEqual([0, 0, 0]);
  });

  it("returns empty per-bucket data for an anonymous caller", async () => {
    const res = await fetchJson(`${VOLUME_URL}?start=2026-01-01&end=2026-03-01`);
    expect(res.status).toBe(200);
    const { boulder } = await res.json();
    expect(boulder.sendCounts).toEqual([0, 0, 0]);
  });

  it("a second user's own request never reflects the first user's sends", async () => {
    await postEntry({ date: "2026-02-10" });
    const userB = await createAuthedSession();
    const { boulder } = await (await getVolume({ start: "2026-01-01", end: "2026-03-01" }, userB.cookie)).json();
    expect(boulder.sendCounts).toEqual([0, 0, 0]);
  });
});
```

- [ ] **Step 2: Run the tests, confirm they fail**

Run: `pnpm exec vitest run test/performance.test.js -t "handleGetVolume"`
Expected: FAIL — `handleGetVolume` doesn't exist and isn't routed yet.

- [ ] **Step 3: Implement `handleGetVolume`**

In `server/api/performance.js`, add the import:

```js
import { bucketLabel, monthBuckets, volumeByBucket } from "../../shared/volume-stats.js";
```

Add the handler after `handleGetStrengthsWeaknesses`:

```js
// #15 -- same online-only, server-computed convention as the three
// handlers above. Requires start/end (unlike the other three handlers
// here, which take no query params) -- there's no sensible "everything"
// default for a time-windowed view the way there is for a ranked-list
// or log view.
export async function handleGetVolume(request, env, userId) {
  const url = new URL(request.url);
  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");
  if (!start || !end) return json({ error: "Missing required field: start and end" }, 400);

  const rows = await listForUser(env, "entries", userId, rowToJson, { excludeDeleted: true });
  const buckets = monthBuckets(start, end);

  function forDiscipline(type) {
    const { sendCounts, maxGradeByBucket } = volumeByBucket(rows.filter(e => e.type === type), buckets);
    return { buckets: buckets.map(bucketLabel), sendCounts, maxGradeByBucket };
  }

  return json({ boulder: forDiscipline("boulder"), lead: forDiscipline("lead") }, 200, { "Cache-Control": "no-store" });
}
```

Note: the response's `buckets` field carries display-ready labels (`bucketLabel(...)`, e.g. `"Jan 2026"`) — the raw `"YYYY-MM"` values never leave the server, since the client only ever needs the formatted label for the chart's x-axis.

Update `server/index.js`'s imports (currently `import { handleGetInjuryLog, handleGetPyramid, handleGetStrengthsWeaknesses } from "./api/performance.js";`):

```js
import { handleGetInjuryLog, handleGetPyramid, handleGetStrengthsWeaknesses, handleGetVolume } from "./api/performance.js";
```

Add the route to `PUBLIC_GET_ROUTES`, directly after the existing strengths entry:

```js
  "/logbook/api/performance/strengths": handleGetStrengthsWeaknesses,
  // #15 -- same public-GET + server-side-computed convention as the
  // three routes above.
  "/logbook/api/performance/volume": handleGetVolume,
```

- [ ] **Step 4: Run the tests, confirm they pass**

Run: `pnpm exec vitest run test/performance.test.js -t "handleGetVolume"`
Expected: PASS (6 tests)

- [ ] **Step 5: Run the full unit suite to confirm no regressions**

Run: `pnpm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add server/api/performance.js server/index.js test/performance.test.js
git commit -m "Add the /performance/volume endpoint (#15)"
```

---

## Task 5: Route plumbing — hub tile, shell, composition-root boilerplate

**Files:**
- Create: `public/performance/trends/index.html`
- Create: `client/performance-trends-main.js`
- Modify: `client/performance-hub-main.js` (add to `INSIGHTS`)
- Modify: `server/api/owned-routes.js` (add to `SHELL_PATHS`)
- Modify: `server/index.js` (extend the owned-route regex, both occurrences)
- Modify: `package.json` (new `performance-trends:build`/`:watch` scripts, `pages:build`, `dev:raw`/`dev:vite`, `e2e:build-fixtures`)
- Modify: `scripts/dev.mjs` (add to the `-n`/`-c`/command lists)
- Modify: `.gitignore` (new bundle-output entry + comment enumeration)
- Modify: `client/store.js` (add `"performance-trends"` to the documented `activeView` union)
- Test: `test/owned-routes.test.js` (new shell-serving test, following the existing tests' exact two-assertion pattern)

**Interfaces:**
- Consumes: Task 4's `/logbook/api/performance/volume` endpoint, Task 1's `renderComboChartHtml`, Task 2's `createTimeWindowControl`.
- Produces: a real, navigable `/:username/performance/trends` route. Task 6 fills in this composition root's actual rendering logic (currently a placeholder shell in this task).

- [ ] **Step 1: Add the hub tile**

In `client/performance-hub-main.js`, add to the `INSIGHTS` array (after the existing strengths entry):

```js
  {
    id: "insight-trends",
    title: "Volume / Intensity",
    description: "See how many climbs you're sending over time, and how your max grade is trending alongside it.",
    route: "trends",
  },
```

- [ ] **Step 2: Register the shell path and extend the owned-route regex**

In `server/api/owned-routes.js`, add to `SHELL_PATHS` (directly after the existing `"performance/strengths"` entry):

```js
  "performance/strengths": "/performance/strengths/index.html",
  "performance/trends": "/performance/trends/index.html",
```

In `server/index.js`, change **both** occurrences of the owned-route regex (currently `performance(?:\/(?:pyramid|injury|strengths))?`) to:

```js
performance(?:\/(?:pyramid|injury|strengths|trends))?
```

Full regex context (both occurrences, identical):

```js
const ownedRouteMatch = pathname.match(/^\/([^/]+)\/(log|map|performance(?:\/(?:pyramid|injury|strengths|trends))?|sync|account(?:\/edit|\/import)?)\/?$/);
```

- [ ] **Step 3: Create the static shell**

Create `public/performance/trends/index.html` — copy `public/performance/strengths/index.html` verbatim, then make exactly these changes: `<title>` becomes `Volume / Intensity – Climbing Logbook`, the header comment's own file-path/route references get updated to say `client/performance-trends-main.js`/this page's own route, the `#performance-offline` message's second `<p>` becomes "Reconnect and reload this page to see your volume/intensity trend.", replace `<div id="strengths-root"></div>` with two containers: `<div id="time-window-root" class="mb-4"></div><div id="trends-root"></div>`, and change the closing `<script>` tag's `src` to `/logbook/performance-trends-app.js`.

- [ ] **Step 4: Create the composition-root skeleton**

Create `client/performance-trends-main.js` — copy `client/performance-strengths-main.js` verbatim as a starting point, then make these changes: remove `cellRowHtml`/`fetchRankedForAnchor`/`onAnchorChange`/`anchorOptionsHtml`/`renderStrengths`/`latestAnchorRequestId`/the `capitalize` helper entirely (strengths-specific, none of it applies here — this task's own review should confirm zero leftover residue, same lesson learned the hard way in this epic's #13 deliverable), rename `STRENGTHS_URL` to a function-built URL (see below, since this endpoint needs `start`/`end` query params, unlike a fixed URL constant), update the file's own header comment to reference `#15` instead of `#13` and describe volume/intensity instead of strengths/weaknesses, add `const trendsRootEl = document.getElementById("trends-root");` and `const timeWindowRootEl = document.getElementById("time-window-root");` alongside the existing `strengthsRootEl`-equivalent line (renamed to match, i.e. delete the old `strengthsRootEl` line entirely), change `store.setActiveView("performance-strengths")` to `store.setActiveView("performance-trends")`.

Replace the old `fetchStrengths` function with:

```js
async function fetchVolume(start, end) {
  const res = await fetch(`/logbook/api/performance/volume?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
```

Change `render()` — this view's discipline switch needs to re-render the already-fetched chart data for the newly active discipline, matching `client/performance-pyramid-main.js`'s own instant-switch-no-refetch precedent (see that file's own `render()`, which sets `pyramidEl.activeDiscipline = store.getActiveType();`). For this task (Task 5), stub this re-render as a currently-empty function — Task 6 fills it in:

```js
let latestVolumeData = null;

function renderTrends() {
  // Task 6 fills this in.
  if (!latestVolumeData) return;
  trendsRootEl.textContent = JSON.stringify(latestVolumeData[store.getActiveType()]);
}

function render() {
  headerChrome.updateDisciplinePicker();
  updateAdminBar();
  renderTrends();
}
```

In `boot()`'s try/catch, replace the old `renderStrengths(data)` call with wiring up the time-window control and fetching on every range change:

```js
  try {
    const timeWindow = createTimeWindowControl({
      containerEl: timeWindowRootEl,
      onChange: async ({ start, end }) => {
        try {
          latestVolumeData = await fetchVolume(start, end);
          offlineEl.hidden = true;
          trendsRootEl.hidden = false;
          renderTrends();
        } catch {
          offlineEl.hidden = false;
          trendsRootEl.hidden = true;
        }
      },
    });
  } catch {
    offlineEl.hidden = false;
    trendsRootEl.hidden = true;
  }
```

(Note: `createTimeWindowControl` itself calls `onChange` once synchronously on creation per Task 2's own contract, so this single wiring point covers both the initial load and every subsequent range change — no separate initial-fetch call needed.)

Add the two new imports at the top of the file:

```js
import { createTimeWindowControl } from "./time-window.js";
```

(`renderComboChartHtml` from `./combo-chart.js` is not needed until Task 6 — do not import it yet, since Task 5's own `renderTrends` stub doesn't use it, and an unused import would repeat this epic's own already-learned lesson about leftover residue.)

- [ ] **Step 5: Add build scripts**

In `package.json`'s `scripts`, add directly after the existing `performance-strengths:build`/`:watch` pair:

```json
    "performance-trends:build": "esbuild client/performance-trends-main.js --bundle --format=esm --outfile=public/logbook/performance-trends-app.js --minify --external:./escape-html.js --external:./floating-ui-dom.js",
    "performance-trends:watch": "esbuild client/performance-trends-main.js --bundle --format=esm --outfile=public/logbook/performance-trends-app.js --watch --external:./escape-html.js --external:./floating-ui-dom.js",
```

Add `pnpm run performance-trends:build` to the `pages:build` chain, directly after `pnpm run performance-strengths:build`.

Change `dev:raw` (inserting `performance-trends` after `performance-strengths` in both the `-n` and `-c` lists — the `-c` list's repeating 6-color cycle, `blue,magenta,yellow,cyan,white,gray`, shifts by one position for everything after the insertion point):

```json
"dev:raw": "concurrently -n wrangler,tailwind,map,performance-pyramid,performance-hub,performance-injury,performance-strengths,performance-trends,log,profile,account,account-edit,account-import,sync,beta-gate -c blue,magenta,yellow,cyan,white,gray,blue,magenta,yellow,cyan,white,gray,blue,magenta,yellow \"wrangler dev\" \"tailwindcss -i ./styles/tailwind.css -o ./public/logbook/tailwind.css --watch\" \"pnpm run map:watch\" \"pnpm run performance-pyramid:watch\" \"pnpm run performance-hub:watch\" \"pnpm run performance-injury:watch\" \"pnpm run performance-strengths:watch\" \"pnpm run performance-trends:watch\" \"pnpm run log:watch\" \"pnpm run profile:watch\" \"pnpm run account:watch\" \"pnpm run account-edit:watch\" \"pnpm run account-import:watch\" \"pnpm run sync:watch\" \"pnpm run beta-gate:watch\"",
```

Change `dev:vite` the same way (only the `-n` list's first entry and the first quoted command differ, `vite`/`"vite dev"` instead of `wrangler`/`"wrangler dev"`):

```json
"dev:vite": "concurrently -n vite,tailwind,map,performance-pyramid,performance-hub,performance-injury,performance-strengths,performance-trends,log,profile,account,account-edit,account-import,sync,beta-gate -c blue,magenta,yellow,cyan,white,gray,blue,magenta,yellow,cyan,white,gray,blue,magenta,yellow \"vite dev\" \"tailwindcss -i ./styles/tailwind.css -o ./public/logbook/tailwind.css --watch\" \"pnpm run map:watch\" \"pnpm run performance-pyramid:watch\" \"pnpm run performance-hub:watch\" \"pnpm run performance-injury:watch\" \"pnpm run performance-strengths:watch\" \"pnpm run performance-trends:watch\" \"pnpm run log:watch\" \"pnpm run profile:watch\" \"pnpm run account:watch\" \"pnpm run account-edit:watch\" \"pnpm run account-import:watch\" \"pnpm run sync:watch\" \"pnpm run beta-gate:watch\"",
```

In `scripts/dev.mjs`, change the `-n`/`-c` lists and the spawn args array (this file has no `beta-gate` entry — a pre-existing, already-accepted drift, not something this task fixes):

```js
  "-n", "vite,tailwind,map,performance-pyramid,performance-hub,performance-injury,performance-strengths,performance-trends,log,profile,account,account-edit,account-import,sync",
  "-c", "blue,magenta,yellow,cyan,white,gray,blue,magenta,yellow,cyan,white,gray,blue,magenta",
  "vite dev",
  "tailwindcss -i ./styles/tailwind.css -o ./public/logbook/tailwind.css --watch",
  "pnpm run map:watch",
  "pnpm run performance-pyramid:watch",
  "pnpm run performance-hub:watch",
  "pnpm run performance-injury:watch",
  "pnpm run performance-strengths:watch",
  "pnpm run performance-trends:watch",
  "pnpm run log:watch",
  "pnpm run profile:watch",
  "pnpm run account:watch",
  "pnpm run account-edit:watch",
  "pnpm run account-import:watch",
  "pnpm run sync:watch",
```

- [ ] **Step 6: Update `.gitignore`, `e2e:build-fixtures`, and `store.js`**

In `.gitignore`, add `client/performance-trends-main.js` to the explanatory comment's enumeration list, and add directly after the existing `public/logbook/performance-strengths-app.js` line:

```
public/logbook/performance-trends-app.js
```

In `package.json`'s `e2e:build-fixtures` script, add a `cp` clause copying `public/performance/trends/index.html` to `public/e2e-fixtures/pages/performance-trends.html`, following the exact pattern the other `performance*.html` clauses already use. Do **not** add a separate esbuild clause bundling `client/performance-trends-main.js` — same dead-build-step mistake #39's own final review had to fix once already, don't repeat it a third time.

In `client/store.js`, find the comment documenting the `activeView` union (currently ending `"performance-strengths"`) and add `"performance-trends"` to it.

- [ ] **Step 7: Write the failing shell-serving test**

In `test/owned-routes.test.js`, add directly after the existing `"serves the real static shell for performance/strengths"` test:

```js
  it("serves the real static shell for performance/trends", async () => {
    const { cookie } = await createAuthedSession({ username: "trendsshelluser", hostname: "climbinglogbook.com" });
    const res = await fetchOwnedRoute("trendsshelluser", "performance/trends", { cookie });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('id="trends-root"');
    expect(html).toContain('src="/logbook/performance-trends-app.js"');
  });
```

- [ ] **Step 8: Run the test, confirm it passes** (after Steps 1-6's file changes are in place)

Run: `pnpm exec vitest run test/owned-routes.test.js -t "performance/trends"`
Expected: PASS

- [ ] **Step 9: Run the full unit suite**

Run: `pnpm test`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add client/performance-hub-main.js client/performance-trends-main.js client/store.js public/performance/trends/index.html server/api/owned-routes.js server/index.js package.json scripts/dev.mjs .gitignore test/owned-routes.test.js
git commit -m "Wire up the /performance/trends route (#15): hub tile, shell, composition root skeleton"
```

---

## Task 6: The actual chart rendering

**Files:**
- Modify: `client/performance-trends-main.js` (replace Task 5's `renderTrends` stub)
- Test: manual verification (pure DOM-rendering logic operating on already-tested data from Tasks 1-4 — no new pure-logic unit tests needed here; e2e coverage is Task 7)

**Interfaces:**
- Consumes: Task 1's `renderComboChartHtml`, Task 3's `gradeDisplayLabel` and `volumeHeadline`, Task 4's endpoint response shape (`{buckets, sendCounts, maxGradeByBucket}` per discipline).

- [ ] **Step 1: Implement the real `renderTrends`**

In `client/performance-trends-main.js`, add the imports:

```js
import { renderComboChartHtml } from "./combo-chart.js";
import { gradeDisplayLabel, volumeHeadline } from "../shared/volume-stats.js";
import { BOULDER_GRADES, LEAD_GRADES } from "../shared/grade-data.js";
```

Replace Task 5's stub `renderTrends` with:

```js
function positionOrderFor(type) {
  return (type === "boulder" ? BOULDER_GRADES : LEAD_GRADES).map(x => x.g);
}

function renderTrends() {
  if (!latestVolumeData) return;
  const type = store.getActiveType();
  const { buckets, sendCounts, maxGradeByBucket } = latestVolumeData[type];

  const points = maxGradeByBucket.map(grade => grade
    ? { positionKey: grade, displayLabel: gradeDisplayLabel(grade, type) }
    : null);

  trendsRootEl.innerHTML = renderComboChartHtml({
    bucketLabels: buckets,
    bars: [{ label: "Sends", values: sendCounts }],
    lines: [{ label: "Max grade", points, positionOrder: positionOrderFor(type) }],
    headline: volumeHeadline(sendCounts),
  });
}
```

- [ ] **Step 2: Add the required caveat text to the shell**

The design doc's own "Chart legibility principles" section requires this view's specific caveat ("this is a send-log proxy, not a measure of real training stimulus") to be visible, same "unconditional caveat line" pattern `#39`'s own injury-log view already established for its own caveat. Add it directly in `public/performance/trends/index.html`, immediately above `<div id="trends-root"></div>` (added in Task 5's Step 3):

```html
      <p class="text-[.75rem] text-muted mb-3" id="trends-caveat">A send-log proxy for training load, not a measure of real training stimulus -- this app has no visibility into gym or hangboard training.</p>
```

- [ ] **Step 3: Manual verification**

Run: `pnpm dev`, log in via `http://my.localhost:<port>/login/` (not plain `localhost`), navigate to `/performance/trends`. Expected: with no sends in the default 3-month window, the chart shows a "No sends logged in this window yet." headline and zero-height bars for each of the 3 months. Log a few sends across different months at different grades, reload, confirm the bar heights reflect send counts per month with numeric labels, the line's points show the correct grade text (`V4`/`V5`/etc. for boulder, raw grade text for lead) positioned in ascending grade order, and switching the discipline picker re-renders the chart for the other discipline without a network request (check the Network tab). Switch the time window to `12mo`, confirm the chart re-fetches and re-renders with 12 buckets. Switch to `Custom`, pick a date range, confirm it re-fetches for that exact range.

- [ ] **Step 4: Run the full unit suite to confirm no regressions**

Run: `pnpm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add client/performance-trends-main.js public/performance/trends/index.html
git commit -m "Render the volume/intensity combo-chart (#15)"
```

---

## Task 7: End-to-end coverage

**Files:**
- Create: `e2e/performance-trends-page.spec.js` (new file, following `e2e/performance-strengths-page.spec.js`'s exact established pattern)
- Modify: `e2e/mock-api.js` (a new `volumeData` option)
- Test: itself

**Interfaces:**
- Consumes: the full Task 1-6 stack, end-to-end, through the real UI and a mocked `/logbook/api/*`.

- [ ] **Step 1: Read `e2e/performance-strengths-page.spec.js` and `e2e/mock-api.js` in full to confirm the exact pattern to extend**

Confirm `mockApi()`'s current shape and add a `volumeData` option, defaulting to a response with zero sends across a 3-bucket window:

```js
  volumeData = {
    boulder: { buckets: ["Jan 2026", "Feb 2026", "Mar 2026"], sendCounts: [0, 0, 0], maxGradeByBucket: [null, null, null] },
    lead: { buckets: ["Jan 2026", "Feb 2026", "Mar 2026"], sendCounts: [0, 0, 0], maxGradeByBucket: [null, null, null] },
  },
```

This endpoint's real requests always carry `?start=&end=` (Task 4's `handleGetVolume` 400s without them), but unlike the strengths endpoint's two-shape branch, every real call here returns the same one shape — a plain fixed-response route (matching `pyramidData`/`injuryData`'s own simpler pattern, not `strengthsData`/`strengthsRankedData`'s branching one) is correct here, with a trailing `**` on the URL pattern only because the request carries a query string (same reasoning `strengthsData`'s own route needed it, even though this route's own handler logic doesn't branch on that query string):

```js
  await page.route("**/logbook/api/performance/volume**", route => route.fulfill({ json: volumeData }));
```

- [ ] **Step 2: Write the failing e2e tests**

Create `e2e/performance-trends-page.spec.js`:

```js
// #15 (epic #5 Phase 2) -- composition-root-wiring coverage for
// /:username/performance/trends, same fixture-harness pattern as
// e2e/performance-strengths-page.spec.js. athleteMode: true is required
// in the mocked settings response -- client/performance-trends-main.js
// redirects to /log otherwise (#151's rule).
import { expect, test } from "@playwright/test";
import { mockApi } from "./mock-api.js";

test("shows the zero-sends headline and the time-window control with no data", async ({ page }) => {
  await mockApi(page, { settings: { athleteMode: true, activeDiscipline: "boulder" } });
  await page.goto("/e2e-fixtures/pages/performance-trends.html");

  await expect(page.locator("climbing-header h1")).toHaveText("Climbing Logbook");
  await expect(page.locator("climbing-tab-bar a", { hasText: "Performance Insights" })).toHaveAttribute("aria-current", "page");
  await expect(page.locator("#trends-caveat")).toContainText("send-log proxy");
  await expect(page.locator('[data-window="3mo"]')).toBeVisible();
  await expect(page.locator("#trends-root")).toContainText("No sends logged in this window yet.");
});

test("renders real bars and a grade-labeled line point", async ({ page }) => {
  await mockApi(page, {
    settings: { athleteMode: true, activeDiscipline: "boulder" },
    volumeData: {
      boulder: { buckets: ["Jan 2026", "Feb 2026", "Mar 2026"], sendCounts: [2, 5, 3], maxGradeByBucket: [null, "6B", "6C"] },
      lead: { buckets: ["Jan 2026", "Feb 2026", "Mar 2026"], sendCounts: [0, 0, 0], maxGradeByBucket: [null, null, null] },
    },
  });
  await page.goto("/e2e-fixtures/pages/performance-trends.html");

  await expect(page.locator("#trends-root")).toContainText("10 sends logged in this window, busiest month had 5.");
  await expect(page.locator("#trends-root svg")).toBeVisible();
  await expect(page.locator("#trends-root")).toContainText("V4"); // gradeDisplayLabel("6B", "boulder")
});

test("switching the time window to 12mo re-fetches with a wider range", async ({ page }) => {
  let lastRequestUrl = null;
  await mockApi(page, { settings: { athleteMode: true, activeDiscipline: "boulder" } });
  await page.route("**/logbook/api/performance/volume**", route => {
    lastRequestUrl = route.request().url();
    return route.fulfill({ json: { boulder: { buckets: [], sendCounts: [], maxGradeByBucket: [] }, lead: { buckets: [], sendCounts: [], maxGradeByBucket: [] } } });
  });
  await page.goto("/e2e-fixtures/pages/performance-trends.html");
  const initialUrl = lastRequestUrl;

  await page.locator('[data-window="12mo"]').click();
  await expect.poll(() => lastRequestUrl).not.toBe(initialUrl);

  const initialStart = new URL(initialUrl).searchParams.get("start");
  const twelveMoStart = new URL(lastRequestUrl).searchParams.get("start");
  expect(new Date(twelveMoStart).getTime()).toBeLessThan(new Date(initialStart).getTime());
});

test("shows the offline message instead of the chart when the fetch fails", async ({ page }) => {
  await mockApi(page, { settings: { athleteMode: true, activeDiscipline: "boulder" } });
  await page.route("**/logbook/api/performance/volume**", route => route.fulfill({ status: 500 }));
  await page.goto("/e2e-fixtures/pages/performance-trends.html");

  await expect(page.locator("#performance-offline")).toBeVisible();
  await expect(page.locator("#trends-root")).toBeHidden();
});

test("redirects to /log when Athlete Mode is off", async ({ page }) => {
  await mockApi(page, { settings: { athleteMode: false, activeDiscipline: "boulder" } });
  await page.goto("/e2e-fixtures/pages/performance-trends.html");

  await page.waitForURL(/\/log$/);
});
```

- [ ] **Step 3: Run the tests, confirm they fail**

Run: `pnpm run e2e:build-fixtures && pnpm exec playwright test e2e/performance-trends-page.spec.js`
Expected: FAIL until Step 1's `mockApi()` extension is correctly connected — fix any real mismatch before treating this as a real product-code failure.

- [ ] **Step 4: Fix any real issues, re-run until green**

Run: `pnpm exec playwright test e2e/performance-trends-page.spec.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Run the full e2e suite twice**

Run: `pnpm exec playwright test` (twice)
Expected: PASS both times.

- [ ] **Step 6: Run the full unit suite one final time**

Run: `pnpm test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add e2e/mock-api.js e2e/performance-trends-page.spec.js
git commit -m "Add e2e coverage for the volume/intensity trend view (#15)"
```

CRITICAL for whoever executes this task: run every command in this task directly and synchronously, in the foreground. Do NOT use Bash `run_in_background` or `Monitor` for the e2e suite runs, even though they're slow — this exact mistake has stranded implementer subagents twice already in this epic (#39, #13), each time leaving real uncommitted work behind that a second dispatch had to recover. Wait for the actual command output inline before moving to the next step.

---

## Final Verification

- [ ] `pnpm test` — full pass
- [ ] `pnpm exec playwright test` — full pass, twice (modulo any pre-existing unrelated flake, already root-caused and fixed for `register.spec.js` in `#588`)
- [ ] Manual: `pnpm dev`, log in, add sends across a few different months and grades, confirm the chart renders correctly for both disciplines and all three window modes (including `Custom`).
- [ ] Confirm the hub page (`/performance`) now shows four tiles, and the new tile's "View" link navigates to `/performance/trends`.
- [ ] Confirm `server/api/public-data.js` has no route to `/logbook/api/performance/volume` (same check every prior deliverable's final review has run).
- [ ] Confirm `git log --oneline` shows 7 task commits, each independently reviewable.
