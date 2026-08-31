// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTimeWindowControl, subtractMonths } from "../../client/time-window.js";

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

  it("3mo from 2026-05-31 clamps to 2026-02-28 (not rolling over to March)", () => {
    // Mock the current date to 2026-05-31
    vi.setSystemTime(new Date("2026-05-31T00:00:00Z"));
    const onChange = vi.fn();
    createTimeWindowControl({ containerEl, onChange, initial: "3mo" });
    const { start, end } = onChange.mock.calls[0][0];
    // 3mo back from 2026-05-31 should be 2026-02-28 (clamped, not rolled over)
    expect(start).toBe("2026-02-28");
    expect(end).toBe("2026-05-31");
  });

  it("12mo from 2024-02-29 (leap year) clamps to 2023-02-28", () => {
    // Mock the current date to 2024-02-29 (leap year)
    vi.setSystemTime(new Date("2024-02-29T00:00:00Z"));
    const onChange = vi.fn();
    createTimeWindowControl({ containerEl, onChange, initial: "12mo" });
    const { start, end } = onChange.mock.calls[0][0];
    // 12mo back from 2024-02-29 should be 2023-02-28 (clamped to non-leap year)
    expect(start).toBe("2023-02-28");
    expect(end).toBe("2024-02-29");
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
    // Re-click Custom (should NOT reset to 3mo range)
    containerEl.querySelector('[data-window="custom"]').click();
    // Check that onChange was called but with the preserved dates
    const lastCall = onChange.mock.calls.at(-1)[0];
    expect(lastCall).toEqual({ start: "2026-01-01", end: "2026-02-15" });
  });
});
