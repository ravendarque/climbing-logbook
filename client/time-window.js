import { escapeHtml } from "./escape-html.js";
import { calendarDatePickerHtml, createCalendarDatePicker } from "./calendar-date-picker.js";

const DAY_MS = 24 * 60 * 60 * 1000;

function toISODate(date) {
  return date.toISOString().slice(0, 10);
}

// Rolling N-week windows, so a range always gives N (or N/4) buckets, never a stray calendar month.
function presetRange(weeks) {
  const end = new Date();
  const start = new Date(end.getTime() - (weeks * 7 - 1) * DAY_MS);
  return { start: toISODate(start), end: toISODate(end) };
}

const WINDOWS = { "12w": 12, "52w": 52 };
const PILL_LABELS = { "12w": "12 weeks", "52w": "52 weeks", custom: "Custom" };

// aria-pressed buttons, not radio labels. A fixed width so the segments match.
const PILL_CLASSES = "border border-border rounded-app bg-surface text-muted text-[.82rem] font-semibold cursor-pointer transition-colors duration-150 hover:text-foreground px-3 py-1 min-w-[5.5rem] text-center aria-[pressed=true]:bg-accent aria-[pressed=true]:text-accent-foreground aria-[pressed=true]:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-foreground focus-visible:outline-offset-2";

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// A visible label: unlike the entry form, there's no text field showing the date.
function formatDateLabel(dateStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!m) return dateStr;
  const [, y, mo, d] = m;
  return `${MONTHS_SHORT[+mo - 1]} ${+d}, ${y}`;
}

export function createTimeWindowControl({ containerEl, onChange, initial = "12w" }) {
  let mode = initial;
  let customRange = presetRange(WINDOWS["12w"]);
  // render() rebuilds everything, so the previous pickers are destroyed first.
  let startPicker = null, endPicker = null;

  function currentRange() {
    return mode === "custom" ? customRange : presetRange(WINDOWS[mode]);
  }

  function render() {
    startPicker?.destroy();
    endPicker?.destroy();
    const pillsHtml = ["12w", "52w", "custom"].map(m => `
      <button type="button" class="${PILL_CLASSES}" data-window="${m}" aria-pressed="${m === mode}">${PILL_LABELS[m]}</button>
    `).join("");

    // No shrink: the row wraps, not the label.
    const customHtml = mode === "custom"
      ? `<div class="flex items-center gap-2 mt-2 flex-wrap">
          <div class="flex items-center gap-2">
            ${calendarDatePickerHtml("time-window-start", { label: "Pick a start date" })}
            <span class="text-[.85rem] text-foreground shrink-0 whitespace-nowrap">${escapeHtml(formatDateLabel(customRange.start))}</span>
          </div>
          <span class="text-muted text-[.82rem]">–</span>
          <div class="flex items-center gap-2">
            ${calendarDatePickerHtml("time-window-end", { label: "Pick an end date" })}
            <span class="text-[.85rem] text-foreground shrink-0 whitespace-nowrap">${escapeHtml(formatDateLabel(customRange.end))}</span>
          </div>
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
      startPicker = createCalendarDatePicker({
        containerEl,
        idPrefix: "time-window-start",
        getValue: () => customRange.start,
        onSelect: dateStr => {
          customRange = { ...customRange, start: dateStr };
          render();
          onChange(currentRange());
        },
      });
      endPicker = createCalendarDatePicker({
        containerEl,
        idPrefix: "time-window-end",
        getValue: () => customRange.end,
        onSelect: dateStr => {
          customRange = { ...customRange, end: dateStr };
          render();
          onChange(currentRange());
        },
      });
    } else {
      startPicker = null;
      endPicker = null;
    }
  }

  render();
  onChange(currentRange());

  return { getRange: currentRange };
}
