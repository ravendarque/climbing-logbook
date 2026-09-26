// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { calendarDatePickerHtml, createCalendarDatePicker } from "../../client/calendar-date-picker.js";

let containerEl;

beforeEach(() => {
  vi.setSystemTime(new Date("2026-08-15T12:00:00Z"));
  document.body.innerHTML = `<div id="container"></div>`;
  containerEl = document.getElementById("container");
});

function mount({ value = "2026-08-15", onSelect = () => {} } = {}) {
  containerEl.innerHTML = calendarDatePickerHtml("date-picker");
  let currentValue = value;
  const picker = createCalendarDatePicker({
    containerEl,
    idPrefix: "date-picker",
    getValue: () => currentValue,
    onSelect: dateStr => {
      currentValue = dateStr;
      onSelect(dateStr);
    },
  });
  return { picker, getValue: () => currentValue };
}

describe("calendarDatePickerHtml", () => {
  it("renders a trigger button and a closed popover, ids scoped by idPrefix", () => {
    containerEl.innerHTML = calendarDatePickerHtml("date-picker");
    expect(containerEl.querySelector("#date-picker-btn")).toBeTruthy();
    expect(containerEl.querySelector("#date-picker-popover").hidden).toBe(true);
  });

  it("scopes every element id to a different idPrefix, so two instances can coexist", () => {
    containerEl.innerHTML = calendarDatePickerHtml("start") + calendarDatePickerHtml("end");
    expect(containerEl.querySelector("#start-btn")).toBeTruthy();
    expect(containerEl.querySelector("#end-btn")).toBeTruthy();
    expect(containerEl.querySelectorAll("[id]").length).toBe(new Set([...containerEl.querySelectorAll("[id]")].map(el => el.id)).size);
  });

  it("uses the default calendar icon in the button when no buttonContent is given", () => {
    containerEl.innerHTML = calendarDatePickerHtml("date-picker");
    expect(containerEl.querySelector("#date-picker-btn svg")).toBeTruthy();
  });

  it("renders custom buttonContent/buttonClasses when supplied", () => {
    containerEl.innerHTML = calendarDatePickerHtml("date-picker", {
      buttonContent: '<span id="my-label">Aug 15, 2026</span>',
      buttonClasses: "my-custom-class",
    });
    expect(containerEl.querySelector("#my-label").textContent).toBe("Aug 15, 2026");
    expect(containerEl.querySelector("#date-picker-btn").className).toBe("my-custom-class");
  });
});

describe("createCalendarDatePicker", () => {
  it("opens the popover on button click, showing the selected value's month", () => {
    mount({ value: "2026-08-15" });
    containerEl.querySelector("#date-picker-btn").click();
    expect(containerEl.querySelector("#date-picker-popover").hidden).toBe(false);
    expect(containerEl.querySelector("#date-picker-month-label").textContent).toBe("August 2026");
  });

  it("marks the currently selected day, and no other day, as aria-selected", () => {
    mount({ value: "2026-08-15" });
    containerEl.querySelector("#date-picker-btn").click();
    const selected = containerEl.querySelectorAll('#date-picker-grid button[aria-selected="true"]');
    expect(selected).toHaveLength(1);
    expect(selected[0].dataset.date).toBe("2026-08-15");
  });

  it("marks today's cell with aria-current when the current month is showing", () => {
    mount({ value: "2026-08-01" });
    containerEl.querySelector("#date-picker-btn").click();
    const todayCell = containerEl.querySelector('#date-picker-grid button[data-date="2026-08-15"]');
    expect(todayCell.getAttribute("aria-current")).toBe("date");
  });

  it("Next/Prev month navigate the view without changing the selected value", () => {
    const { getValue } = mount({ value: "2026-08-15" });
    containerEl.querySelector("#date-picker-btn").click();
    containerEl.querySelector("#date-picker-next-month").click();
    expect(containerEl.querySelector("#date-picker-month-label").textContent).toBe("September 2026");
    expect(getValue()).toBe("2026-08-15"); // navigating away isn't a selection
    containerEl.querySelector("#date-picker-prev-month").click();
    expect(containerEl.querySelector("#date-picker-month-label").textContent).toBe("August 2026");
  });

  it("navigating past December/January wraps the year forward", () => {
    mount({ value: "2026-12-15" });
    containerEl.querySelector("#date-picker-btn").click();
    containerEl.querySelector("#date-picker-next-month").click();
    expect(containerEl.querySelector("#date-picker-month-label").textContent).toBe("January 2027");
  });

  it("navigating past January/December wraps the year backward", () => {
    mount({ value: "2026-01-15" });
    containerEl.querySelector("#date-picker-btn").click();
    containerEl.querySelector("#date-picker-prev-month").click();
    expect(containerEl.querySelector("#date-picker-month-label").textContent).toBe("December 2025");
  });

  it("clicking a day cell calls onSelect with that date and closes the popover", () => {
    const onSelect = vi.fn();
    mount({ value: "2026-08-15", onSelect });
    containerEl.querySelector("#date-picker-btn").click();
    containerEl.querySelector('#date-picker-grid button[data-date="2026-08-03"]').click();
    expect(onSelect).toHaveBeenCalledWith("2026-08-03");
    expect(containerEl.querySelector("#date-picker-popover").hidden).toBe(true);
  });

  it("re-opening after a selection shows the newly selected day, not the old one", () => {
    mount({ value: "2026-08-15" });
    containerEl.querySelector("#date-picker-btn").click();
    containerEl.querySelector('#date-picker-grid button[data-date="2026-08-03"]').click();
    containerEl.querySelector("#date-picker-btn").click();
    const selected = containerEl.querySelectorAll('#date-picker-grid button[aria-selected="true"]');
    expect(selected).toHaveLength(1);
    expect(selected[0].dataset.date).toBe("2026-08-03");
  });

  it("falls back to today's own month for an empty/unparseable value", () => {
    mount({ value: "" });
    containerEl.querySelector("#date-picker-btn").click();
    expect(containerEl.querySelector("#date-picker-month-label").textContent).toBe("August 2026");
    expect(containerEl.querySelectorAll('#date-picker-grid button[aria-selected="true"]')).toHaveLength(0);
  });

  it("accepts a YYYY-MM value (no day), showing that month with no day selected", () => {
    mount({ value: "2026-08" });
    containerEl.querySelector("#date-picker-btn").click();
    expect(containerEl.querySelector("#date-picker-month-label").textContent).toBe("August 2026");
    expect(containerEl.querySelectorAll('#date-picker-grid button[aria-selected="true"]')).toHaveLength(0);
  });

  it("renders exactly one weekday header per weekday", () => {
    mount({ value: "2026-08-15" });
    containerEl.querySelector("#date-picker-btn").click();
    expect(containerEl.querySelectorAll("#date-picker-weekdays span")).toHaveLength(7);
  });

  it("two instances (idPrefix start/end) operate independently", () => {
    containerEl.innerHTML = calendarDatePickerHtml("start") + calendarDatePickerHtml("end");
    let startValue = "2026-08-01", endValue = "2026-08-31";
    createCalendarDatePicker({ containerEl, idPrefix: "start", getValue: () => startValue, onSelect: d => { startValue = d; } });
    createCalendarDatePicker({ containerEl, idPrefix: "end", getValue: () => endValue, onSelect: d => { endValue = d; } });
    containerEl.querySelector("#start-btn").click();
    expect(containerEl.querySelector("#start-popover").hidden).toBe(false);
    expect(containerEl.querySelector("#end-popover").hidden).toBe(true);
    containerEl.querySelector('#start-grid button[data-date="2026-08-10"]').click();
    expect(startValue).toBe("2026-08-10");
    expect(endValue).toBe("2026-08-31"); // untouched
  });
});
