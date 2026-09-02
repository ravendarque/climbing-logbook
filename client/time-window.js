// Shared time-window control (#15, epic #5 Phase 2) -- a segmented pill
// (12w / 52w / Custom), same implementation granularity as client/
// combo-chart.js and client/row-card.js (a plain JS module, not a Custom
// Element). Custom reveals two native date inputs -- same pattern client/
// entry-form.js's own date-picker-btn/date-native already establishes,
// not a hand-built calendar widget.
import { escapeHtml } from "./escape-html.js";

const DAY_MS = 24 * 60 * 60 * 1000;

function toISODate(date) {
  return date.toISOString().slice(0, 10);
}

// #600 -- replaces the old subtractMonths()-based calendar-month presets:
// a "3 months" request built from day-preserving month subtraction spans
// parts of 4 distinct calendar months depending on where "today" falls in
// its own month (Raven's own report -- "should show 3, showing 4"),
// because shared/volume-stats.js's own bucketing walked every calendar
// month the range touched. Plain rolling day windows sidestep that
// mismatch entirely: a window of exactly N*7 days always produces exactly
// N weekly (or 4-weekly, see weekBuckets' own TARGET_BUCKET_COUNT) chart
// buckets, with no calendar-boundary case to get wrong.
function presetRange(weeks) {
  const end = new Date();
  const start = new Date(end.getTime() - (weeks * 7 - 1) * DAY_MS);
  return { start: toISODate(start), end: toISODate(end) };
}

const WINDOWS = { "12w": 12, "52w": 52 };
const PILL_LABELS = { "12w": "12 weeks", "52w": "52 weeks", custom: "Custom" };

// #600 -- real toggle-button styling (was bare `toggle-btn` with none of
// the utility classes that name actually depends on -- see public/log/
// index.html's status radio buttons for the working has-checked: version
// of this same visual language). This control's pills are plain
// <button aria-pressed> elements, not radio-backed <label>s, so the
// has-checked: variant doesn't apply -- aria-[pressed=true]: does the
// same job, same pattern client/components/climbing-tab-bar.js's own
// LINK_CLASSES already uses for aria-[current=page]:.
const PILL_CLASSES = "border border-border rounded-app bg-surface text-muted text-[.82rem] font-semibold cursor-pointer transition-colors duration-150 hover:text-foreground px-3 py-1 aria-[pressed=true]:bg-accent aria-[pressed=true]:text-accent-foreground aria-[pressed=true]:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-foreground focus-visible:outline-offset-2";
// text-foreground -- same dark-mode fix #597 already applied to client/
// move-tagging.js's selects (the working precedent, .grade-select, sets
// this explicitly); these date inputs had no text color at all, falling
// back to the browser's native black-on-dark default.
const DATE_INPUT_CLASSES = "bg-surface border border-border rounded-app px-2 py-1 text-[.85rem] text-foreground";

export function createTimeWindowControl({ containerEl, onChange, initial = "12w" }) {
  let mode = initial;
  let customRange = presetRange(WINDOWS["12w"]);

  function currentRange() {
    return mode === "custom" ? customRange : presetRange(WINDOWS[mode]);
  }

  function render() {
    const pillsHtml = ["12w", "52w", "custom"].map(m => `
      <button type="button" class="${PILL_CLASSES}" data-window="${m}" aria-pressed="${m === mode}">${PILL_LABELS[m]}</button>
    `).join("");

    const customHtml = mode === "custom"
      ? `<div class="flex gap-2 mt-2">
          <input type="date" class="${DATE_INPUT_CLASSES}" id="time-window-start" value="${escapeHtml(customRange.start)}">
          <input type="date" class="${DATE_INPUT_CLASSES}" id="time-window-end" value="${escapeHtml(customRange.end)}">
        </div>`
      : "";

    containerEl.innerHTML = `<div class="flex gap-1">${pillsHtml}</div>${customHtml}`;

    for (const btn of containerEl.querySelectorAll("[data-window]")) {
      btn.addEventListener("click", () => {
        const wasAlreadyCustom = mode === "custom";
        mode = btn.dataset.window;
        if (mode === "custom" && !wasAlreadyCustom) customRange = presetRange(WINDOWS["12w"]);
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
