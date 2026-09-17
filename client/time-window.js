// Shared time-window control (#15, epic #5 Phase 2) -- a segmented pill
// (12w / 52w / Custom), same implementation granularity as client/
// combo-chart.js and client/row-card.js (a plain JS module, not a Custom
// Element). Custom reveals two calendar-date-picker.js pickers (#736) --
// originally two native <input type="date">s, which turned out to be
// exactly the OS/browser-chrome pattern entry-form.js's own #703-review
// date picker had already been built to replace; #736 extracted that
// fix into a shared component instead of leaving this control as the
// one place still using the old pattern (confirmed live during #717/
// #733 review, 2026-09-12).
import { escapeHtml } from "./escape-html.js";
import { calendarDatePickerHtml, createCalendarDatePicker } from "./calendar-date-picker.js";

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
// #798 -- min-w-[5.5rem]/text-center: the three pills' own labels ("12
// weeks"/"52 weeks"/"Custom") are genuinely different lengths, and with
// no width control each button sized to its own content -- a real
// segmented control (this file's own header comment already calls it
// that) reads as broken when its segments aren't a uniform width. Sized
// to comfortably fit "12 weeks"/"52 weeks" (the two longest labels, tied)
// with "Custom" simply centering within the same width.
const PILL_CLASSES = "border border-border rounded-app bg-surface text-muted text-[.82rem] font-semibold cursor-pointer transition-colors duration-150 hover:text-foreground px-3 py-1 min-w-[5.5rem] text-center aria-[pressed=true]:bg-accent aria-[pressed=true]:text-accent-foreground aria-[pressed=true]:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-foreground focus-visible:outline-offset-2";

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Unlike entry-form.js's date field -- an icon-only picker button beside
// a free-text field that already shows the value -- there's no sibling
// field here, so the picked date needs its own visible text. Rendered as
// a plain label next to the picker's own icon-only button rather than
// teaching calendar-date-picker.js to grow a second button shape: this
// file's render() already fully rebuilds on every state change (see the
// pill click handler below), so a label baked straight into the same
// template string that already re-renders on every customRange change
// needs no extra "keep it in sync" wiring of its own.
function formatDateLabel(dateStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!m) return dateStr;
  const [, y, mo, d] = m;
  return `${MONTHS_SHORT[+mo - 1]} ${+d}, ${y}`;
}

export function createTimeWindowControl({ containerEl, onChange, initial = "12w" }) {
  let mode = initial;
  let customRange = presetRange(WINDOWS["12w"]);
  // #736 -- render() below fully rebuilds containerEl.innerHTML on every
  // state change, so the two calendar pickers it creates each carry a
  // real createDisclosure() with document-level listeners that need
  // tearing down before the next rebuild -- otherwise every pill click
  // or date pick piles up another pair of listeners forever, each
  // keeping its own now-detached trigger/popover alive too. Tracked here
  // so render() can destroy() the previous pair before creating the
  // next.
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

    // #798 -- shrink-0 whitespace-nowrap on each date label: as a flex
    // sibling of the picker's own fixed-width flex-[0_0_2.75rem] button
    // (calendar-date-picker.js), a label with no shrink protection could
    // be squeezed by its own row's available width and wrap "Jun 25,
    // 2026" onto two lines -- the row itself is already allowed to wrap
    // as a whole (this container's own flex-wrap), so the label never
    // needs to break internally.
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
