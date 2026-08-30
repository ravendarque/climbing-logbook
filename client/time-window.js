// Shared time-window control (#15, epic #5 Phase 2) -- a segmented pill
// (3mo / 12mo / Custom), same implementation granularity as client/
// combo-chart.js and client/row-card.js (a plain JS module, not a Custom
// Element). Custom reveals two native date inputs -- same pattern client/
// entry-form.js's own date-picker-btn/date-native already establishes,
// not a hand-built calendar widget.
import { escapeHtml } from "./escape-html.js";

function toISODate(date) {
  return date.toISOString().slice(0, 10);
}

// Subtract months from a date, clamping to the target month's last day to
// avoid rollover (e.g., 2026-05-31 - 3mo = 2026-02-28, not 2026-03-03).
export function subtractMonths(date, months) {
  const d = new Date(date);
  const targetMonth = d.getUTCMonth() - months;
  const originalDay = d.getUTCDate();
  d.setUTCDate(1); // avoid overflow while setting the month
  d.setUTCMonth(targetMonth);
  const daysInTargetMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(originalDay, daysInTargetMonth));
  return d;
}

function presetRange(preset) {
  const end = new Date();
  let start;
  if (preset === "3mo") start = subtractMonths(end, 3);
  else if (preset === "12mo") start = subtractMonths(end, 12);
  else start = new Date(end);
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
          <input type="date" class="bg-surface border border-border rounded-app px-2 py-1 text-[.85rem]" id="time-window-start" value="${escapeHtml(customRange.start)}">
          <input type="date" class="bg-surface border border-border rounded-app px-2 py-1 text-[.85rem]" id="time-window-end" value="${escapeHtml(customRange.end)}">
        </div>`
      : "";

    containerEl.innerHTML = `<div class="flex gap-1">${pillsHtml}</div>${customHtml}`;

    for (const btn of containerEl.querySelectorAll("[data-window]")) {
      btn.addEventListener("click", () => {
        const wasAlreadyCustom = mode === "custom";
        mode = btn.dataset.window;
        if (mode === "custom" && !wasAlreadyCustom) customRange = presetRange("3mo");
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
