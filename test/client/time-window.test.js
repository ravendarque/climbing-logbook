// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTimeWindowControl } from "../../client/time-window.js";

let containerEl;

beforeEach(() => {
  document.body.innerHTML = `<div id="container"></div>`;
  containerEl = document.getElementById("container");
});

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
    const [startInput, endInput] = containerEl.querySelectorAll('input[type="date"]');
    startInput.value = "2026-01-01";
    startInput.dispatchEvent(new Event("change", { bubbles: true }));
    endInput.value = "2026-02-15";
    endInput.dispatchEvent(new Event("change", { bubbles: true }));
    // Clear the mock to count only calls after this point
    onChange.mockClear();
    // Re-click Custom (should NOT reset to 12w range)
    containerEl.querySelector('[data-window="custom"]').click();
    // Check that onChange was called but with the preserved dates
    const lastCall = onChange.mock.calls.at(-1)[0];
    expect(lastCall).toEqual({ start: "2026-01-01", end: "2026-02-15" });
  });

  it("pill buttons carry real styling utility classes, not just the non-functional toggle-btn label", () => {
    createTimeWindowControl({ containerEl, onChange: () => {} });
    const btn = containerEl.querySelector('[data-window="12w"]');
    expect(btn.className).toContain("bg-surface");
    expect(btn.className).toContain("aria-[pressed=true]:bg-accent");
  });

  it("Custom date inputs set an explicit foreground text color (dark-mode readability, #600)", () => {
    createTimeWindowControl({ containerEl, onChange: () => {} });
    containerEl.querySelector('[data-window="custom"]').click();
    for (const input of containerEl.querySelectorAll('input[type="date"]')) {
      expect(input.className).toContain("text-foreground");
    }
  });
});
