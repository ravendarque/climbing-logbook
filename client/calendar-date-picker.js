// Markup and behaviour are separate: idPrefix lets several pickers share a page, and the caller owns the value.
import { escapeHtml } from "./escape-html.js";
import { createDisclosure } from "./modal-utils.js";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const DAY_CELL_CLASSES = "h-7 flex items-center justify-center rounded-[calc(var(--radius-app)-2px)] text-[.78rem] text-foreground border-0 bg-transparent cursor-pointer hover:bg-[color-mix(in_srgb,var(--color-accent)_8%,transparent)] aria-selected:bg-accent aria-selected:text-accent-foreground aria-selected:hover:bg-accent aria-[current=date]:font-bold aria-[current=date]:text-accent";

const CALENDAR_ICON = `<svg class="w-[1.1rem] h-[1.1rem] stroke-current" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <rect x="3" y="5" width="18" height="16" rx="2"></rect>
  <line x1="3" y1="10" x2="21" y2="10"></line>
  <line x1="8" y1="3" x2="8" y2="7"></line>
  <line x1="16" y1="3" x2="16" y2="7"></line>
</svg>`;

export function calendarDatePickerHtml(idPrefix, {
  label = "Pick a date",
  wrapClasses = "relative flex-[0_0_2.75rem]",
  buttonClasses = "w-full h-full flex items-center justify-center border border-border rounded-app bg-surface text-foreground cursor-pointer hover:border-accent",
  buttonContent = CALENDAR_ICON,
} = {}) {
  const p = idPrefix;
  return `
    <div class="${wrapClasses}" id="${p}-wrap">
      <button type="button" class="${buttonClasses}" id="${p}-btn" aria-haspopup="dialog" aria-expanded="false" aria-label="${escapeHtml(label)}">
        ${buttonContent}
      </button>
      <div class="absolute top-[calc(100%+.4rem)] right-0 z-20 bg-background border border-border rounded-app p-[.6rem] w-[16rem] max-w-[calc(100vw-2rem)] shadow-[0_8px_24px_color-mix(in_srgb,black_35%,transparent)]" id="${p}-popover" role="dialog" aria-label="${escapeHtml(label)}" hidden>
        <div class="flex items-center justify-between mb-2">
          <button type="button" class="w-7 h-7 flex items-center justify-center border-0 bg-transparent text-foreground cursor-pointer rounded-[calc(var(--radius-app)-2px)] hover:bg-[color-mix(in_srgb,var(--color-accent)_8%,transparent)]" id="${p}-prev-month" aria-label="Previous month">
            <svg class="w-[.7rem] h-[.7rem] fill-current" viewBox="0 0 24 24"><polygon points="16 5 6 12 16 19"></polygon></svg>
          </button>
          <span class="text-[.85rem] font-semibold text-foreground" id="${p}-month-label"></span>
          <button type="button" class="w-7 h-7 flex items-center justify-center border-0 bg-transparent text-foreground cursor-pointer rounded-[calc(var(--radius-app)-2px)] hover:bg-[color-mix(in_srgb,var(--color-accent)_8%,transparent)]" id="${p}-next-month" aria-label="Next month">
            <svg class="w-[.7rem] h-[.7rem] fill-current" viewBox="0 0 24 24"><polygon points="8 5 18 12 8 19"></polygon></svg>
          </button>
        </div>
        <div class="grid grid-cols-7 gap-[.15rem] text-center text-[.68rem] font-semibold text-muted mb-1" id="${p}-weekdays"></div>
        <div class="grid grid-cols-7 gap-[.15rem]" id="${p}-grid"></div>
      </div>
    </div>`;
}

function parseDateValue(value) {
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec((value ?? "").trim());
  if (m) return { year: +m[1], month: +m[2] - 1, day: m[3] ? +m[3] : null };
  const today = new Date();
  return { year: today.getFullYear(), month: today.getMonth(), day: null };
}

export function createCalendarDatePicker({ containerEl, idPrefix, getValue, onSelect }) {
  const p = idPrefix;
  const btn = containerEl.querySelector(`#${p}-btn`);
  const popover = containerEl.querySelector(`#${p}-popover`);
  const monthLabelEl = containerEl.querySelector(`#${p}-month-label`);
  const weekdaysEl = containerEl.querySelector(`#${p}-weekdays`);
  const gridEl = containerEl.querySelector(`#${p}-grid`);
  const prevMonthBtn = containerEl.querySelector(`#${p}-prev-month`);
  const nextMonthBtn = containerEl.querySelector(`#${p}-next-month`);

  // The view month moves without selecting; it re-seeds from getValue() on open.
  let viewYear, viewMonth; // month is 0-indexed, Date's own convention

  function render() {
    const selected = parseDateValue(getValue());
    monthLabelEl.textContent = `${MONTHS[viewMonth]} ${viewYear}`;
    weekdaysEl.innerHTML = WEEKDAYS.map(w => `<span>${escapeHtml(w)}</span>`).join("");

    const startWeekday = new Date(viewYear, viewMonth, 1).getDay(); // 0 = Sunday
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    // Local time: toISOString() is UTC, which marks the wrong day as today behind UTC.
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

    const cells = Array.from({ length: startWeekday }, () => "<span></span>");
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const isSelected = selected.year === viewYear && selected.month === viewMonth && selected.day === day;
      cells.push(`<button type="button" class="${DAY_CELL_CLASSES}" data-date="${dateStr}" aria-selected="${isSelected}" aria-current="${dateStr === todayStr ? "date" : "false"}">${day}</button>`);
    }
    gridEl.innerHTML = cells.join("");
  }

  const { close, destroy } = createDisclosure(btn, popover, `#${p}-wrap`, {
    onOpen: () => {
      const { year, month } = parseDateValue(getValue());
      viewYear = year;
      viewMonth = month;
      render();
    },
  });
  prevMonthBtn.addEventListener("click", () => {
    viewMonth--;
    if (viewMonth < 0) { viewMonth = 11; viewYear--; }
    render();
  });
  nextMonthBtn.addEventListener("click", () => {
    viewMonth++;
    if (viewMonth > 11) { viewMonth = 0; viewYear++; }
    render();
  });
  gridEl.addEventListener("click", e => {
    const cell = e.target.closest("button[data-date]");
    if (!cell) return;
    onSelect(cell.dataset.date);
    // A caller may have replaced this markup already; closing a detached node is harmless.
    close();
    btn.focus();
  });

  // Only the disclosure's document listeners outlive a markup replacement.
  return { close, destroy };
}
