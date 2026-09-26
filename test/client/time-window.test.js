// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTimeWindowControl } from "../../client/time-window.js";

let containerEl;

beforeEach(() => {
  document.body.innerHTML = `<div id="container"></div>`;
  containerEl = document.getElementById("container");
});

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
    containerEl.querySelector('[data-window="custom"]').click();
    const pickedStart = pickAnyOtherDay("time-window-start");
    const pickedEnd = pickAnyOtherDay("time-window-end");
    onChange.mockClear();
    containerEl.querySelector('[data-window="custom"]').click();
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
    const removeSpy = vi.spyOn(document, "removeEventListener");
    createTimeWindowControl({ containerEl, onChange: () => {} });
    containerEl.querySelector('[data-window="custom"]').click();
    removeSpy.mockClear();
    pickAnyOtherDay("time-window-start"); // triggers a re-render
    expect(removeSpy.mock.calls.length).toBe(4);
    removeSpy.mockRestore();
  });

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
