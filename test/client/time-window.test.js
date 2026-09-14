// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTimeWindowControl } from "../../client/time-window.js";

let containerEl;

beforeEach(() => {
  document.body.innerHTML = `<div id="container"></div>`;
  containerEl = document.getElementById("container");
});

// #736 -- Custom range now uses two calendar-date-picker.js instances
// instead of native <input type="date">s. This file tests the
// INTEGRATION contract only (Custom mode wires two pickers to
// customRange.start/end, selecting a day fires onChange with the
// updated range) -- the calendar widget's own internals (month nav,
// today/selected marking, value parsing) are already covered directly by
// test/client/calendar-date-picker.test.js, not re-tested here. Picks
// whatever day cell isn't already selected, rather than a hardcoded
// date, so these tests don't depend on which month the picker's initial
// value happens to open on relative to the current system time.
function pickAnyOtherDay(idPrefix) {
  containerEl.querySelector(`#${idPrefix}-btn`).click();
  const cell = [...containerEl.querySelectorAll(`#${idPrefix}-grid button[data-date]`)]
    .find(el => el.getAttribute("aria-selected") !== "true");
  cell.click();
  return cell.dataset.date;
}

describe("createTimeWindowControl", () => {
  it("calls onChange immediately with the initial 12w range", () => {
    const onChange = vi.fn();
    createTimeWindowControl({ containerEl, onChange, initial: "12w" });
    expect(onChange).toHaveBeenCalledTimes(1);
    const { start, end } = onChange.mock.calls[0][0];
    expect(start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(end).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(new Date(start).getTime()).toBeLessThan(new Date(end).getTime());
  });

  it("renders three pill buttons: 12w, 52w, Custom", () => {
    createTimeWindowControl({ containerEl, onChange: () => {} });
    expect(containerEl.querySelector('[data-window="12w"]')).toBeTruthy();
    expect(containerEl.querySelector('[data-window="52w"]')).toBeTruthy();
    expect(containerEl.querySelector('[data-window="custom"]')).toBeTruthy();
  });

  it("switching to 52w produces a wider range than 12w and fires onChange again", () => {
    const onChange = vi.fn();
    createTimeWindowControl({ containerEl, onChange, initial: "12w" });
    containerEl.querySelector('[data-window="52w"]').click();
    expect(onChange).toHaveBeenCalledTimes(2);
    const { start: start12w } = onChange.mock.calls[0][0];
    const { start: start52w } = onChange.mock.calls[1][0];
    expect(new Date(start52w).getTime()).toBeLessThan(new Date(start12w).getTime());
  });

  it("switching to Custom reveals two calendar-date-picker buttons, not present before", () => {
    createTimeWindowControl({ containerEl, onChange: () => {} });
    expect(containerEl.querySelector("#time-window-start-btn")).toBeFalsy();
    containerEl.querySelector('[data-window="custom"]').click();
    expect(containerEl.querySelector("#time-window-start-btn")).toBeTruthy();
    expect(containerEl.querySelector("#time-window-end-btn")).toBeTruthy();
  });

  it("picking both custom dates fires onChange with the chosen range", () => {
    const onChange = vi.fn();
    createTimeWindowControl({ containerEl, onChange });
    containerEl.querySelector('[data-window="custom"]').click();
    const pickedStart = pickAnyOtherDay("time-window-start");
    const pickedEnd = pickAnyOtherDay("time-window-end");
    const last = onChange.mock.calls.at(-1)[0];
    expect(last).toEqual({ start: pickedStart, end: pickedEnd });
  });

  it("getRange() returns the currently active range", () => {
    const control = createTimeWindowControl({ containerEl, onChange: () => {}, initial: "12w" });
    const { start, end } = control.getRange();
    expect(start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(end).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  // #600 -- replaces the old calendar-month-clamping tests (subtractMonths
  // is gone): a rolling day window has no month-boundary case to clamp at
  // all, so the thing worth asserting now is that the span is always
  // exactly N*7 days, regardless of where "today" falls in its own month.
  it("12w is always exactly 84 days (12*7), inclusive of both ends", () => {
    vi.setSystemTime(new Date("2026-05-31T00:00:00Z"));
    const onChange = vi.fn();
    createTimeWindowControl({ containerEl, onChange, initial: "12w" });
    const { start, end } = onChange.mock.calls[0][0];
    expect(end).toBe("2026-05-31");
    expect(start).toBe("2026-03-09");
    const spanDays = (new Date(end) - new Date(start)) / 86400000 + 1;
    expect(spanDays).toBe(84);
  });

  it("52w is always exactly 364 days (52*7), inclusive of both ends", () => {
    vi.setSystemTime(new Date("2024-02-29T00:00:00Z")); // leap day -- no special-casing needed either
    const onChange = vi.fn();
    createTimeWindowControl({ containerEl, onChange, initial: "52w" });
    const { start, end } = onChange.mock.calls[0][0];
    expect(end).toBe("2024-02-29");
    expect(start).toBe("2023-03-03");
    const spanDays = (new Date(end) - new Date(start)) / 86400000 + 1;
    expect(spanDays).toBe(364);
  });

  it("re-clicking the already-active Custom pill preserves the picked dates", () => {
    const onChange = vi.fn();
    createTimeWindowControl({ containerEl, onChange });
    // Switch to Custom
    containerEl.querySelector('[data-window="custom"]').click();
    // Update the dates
    const pickedStart = pickAnyOtherDay("time-window-start");
    const pickedEnd = pickAnyOtherDay("time-window-end");
    // Clear the mock to count only calls after this point
    onChange.mockClear();
    // Re-click Custom (should NOT reset to 12w range)
    containerEl.querySelector('[data-window="custom"]').click();
    // Check that onChange was called but with the preserved dates
    const lastCall = onChange.mock.calls.at(-1)[0];
    expect(lastCall).toEqual({ start: pickedStart, end: pickedEnd });
  });

  it("pill buttons carry real styling utility classes, not just the non-functional toggle-btn label", () => {
    createTimeWindowControl({ containerEl, onChange: () => {} });
    const btn = containerEl.querySelector('[data-window="12w"]');
    expect(btn.className).toContain("bg-surface");
    expect(btn.className).toContain("aria-[pressed=true]:bg-accent");
  });

  it("Custom range's picked-date labels set an explicit foreground text color (dark-mode readability, #600)", () => {
    createTimeWindowControl({ containerEl, onChange: () => {} });
    containerEl.querySelector('[data-window="custom"]').click();
    // #736 -- the label showing the picked date replaced the old native
    // date inputs (which needed this same explicit color fix, #600, so
    // the value text wasn't invisible against a dark background) as the
    // one thing in Custom mode displaying date text directly.
    const labels = containerEl.querySelectorAll(".flex.items-center.gap-2 > span.text-foreground");
    expect(labels).toHaveLength(2);
  });

  it("Custom range shows the picked start/end dates as readable text, not just raw ISO strings", () => {
    vi.setSystemTime(new Date("2026-01-15T12:00:00Z"));
    createTimeWindowControl({ containerEl, onChange: () => {} });
    containerEl.querySelector('[data-window="custom"]').click();
    expect(containerEl.textContent).toContain("2026"); // the year is real content, not asserting exact formatting here
    expect(containerEl.textContent).not.toContain("undefined");
  });

  it("destroys the previous Custom pickers' listeners on every re-render, not just the DOM", () => {
    // #736 -- render() fully rebuilds containerEl.innerHTML on every
    // state change; without destroy()ing the previous pair of
    // calendar-date-picker instances first, their document-level
    // listeners (createDisclosure's outside-click/Escape handlers) would
    // pile up forever across repeated picks, each one keeping its own
    // now-detached button/popover alive too.
    const removeSpy = vi.spyOn(document, "removeEventListener");
    createTimeWindowControl({ containerEl, onChange: () => {} });
    containerEl.querySelector('[data-window="custom"]').click();
    removeSpy.mockClear();
    pickAnyOtherDay("time-window-start"); // triggers a re-render
    // 2 pickers x 2 document-level listeners each (outside-click, Escape)
    expect(removeSpy.mock.calls.length).toBe(4);
    removeSpy.mockRestore();
  });

  // #754 -- the test above only ever exercised a Custom->Custom
  // re-render (picking a date while staying in Custom mode). Leaving
  // Custom mode entirely (back to a preset) is the transition most
  // likely to actually happen in real use, and is a structurally
  // different code path: render()'s own `else { startPicker = null;
  // endPicker = null; }` branch, not the `if (mode === "custom")` one
  // the test above covers. A refactor that only destroy()s "when
  // staying in Custom" would pass the test above yet leak here.
  it("also destroys the previous Custom pickers' listeners when leaving Custom mode for a preset", () => {
    const removeSpy = vi.spyOn(document, "removeEventListener");
    createTimeWindowControl({ containerEl, onChange: () => {} });
    containerEl.querySelector('[data-window="custom"]').click();
    removeSpy.mockClear();
    containerEl.querySelector('[data-window="12w"]').click(); // leaves Custom entirely
    expect(removeSpy.mock.calls.length).toBe(4);
    removeSpy.mockRestore();
  });
});
