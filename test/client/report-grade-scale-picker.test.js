// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createReportGradeScalePicker } from "../../client/report-grade-scale-picker.js";

let containerEl;
let activeType;

beforeEach(() => {
  localStorage.clear();
  history.pushState({}, "", "/nix/performance/trends");
  document.body.innerHTML = `<div id="container"></div>`;
  containerEl = document.getElementById("container");
  activeType = "boulder";
});

function mount(onChange = () => {}) {
  return createReportGradeScalePicker({ containerEl, getType: () => activeType, onChange });
}

describe("createReportGradeScalePicker", () => {
  it("defaults to Font (boulder) / French (sport) when no preference is stored", () => {
    const picker = mount();
    expect(picker.getScaleId()).toBe("font");
    activeType = "sport";
    expect(picker.getScaleIdFor("sport")).toBe("french");
  });

  it("renders a trigger button and the 'What's this?' link pointing at the public grades reference page", () => {
    mount();
    expect(containerEl.querySelector("#report-grade-scale-btn")).toBeTruthy();
    expect(containerEl.querySelector("#report-grade-scale-reference-link").getAttribute("href")).toBe("/help/grade-scales/");
  });

  it("opens the popover on click and lists only the standard scales for the active discipline", () => {
    mount();
    containerEl.querySelector("#report-grade-scale-btn").click();
    expect(containerEl.querySelector("#report-grade-scale-popover").hidden).toBe(false);
    const options = [...containerEl.querySelectorAll('#report-grade-scale-listbox [role="option"]')];
    expect(options.map(o => o.dataset.key)).toEqual(["font", "v-scale"]);
  });

  it("selecting a scale updates getScaleId(), persists to localStorage, and fires onChange", () => {
    const onChange = vi.fn();
    const picker = mount(onChange);
    containerEl.querySelector("#report-grade-scale-btn").click();
    containerEl.querySelector('#report-grade-scale-listbox [role="option"][data-key="v-scale"]').click();

    expect(picker.getScaleId()).toBe("v-scale");
    expect(onChange).toHaveBeenCalledWith("v-scale");
    expect(localStorage.getItem("logbook_grade_scale_reports_boulder")).toBe("v-scale");
  });

  it("each discipline's preference persists independently -- selecting Boulder's scale never touches Sport's", () => {
    const picker = mount();
    containerEl.querySelector("#report-grade-scale-btn").click();
    containerEl.querySelector('#report-grade-scale-listbox [role="option"][data-key="v-scale"]').click();

    activeType = "sport";
    expect(picker.getScaleId()).toBe("french"); // untouched, still the default
    expect(picker.getScaleIdFor("boulder")).toBe("v-scale"); // the one we actually changed
  });

  it("a stored preference is picked up fresh on construction, per discipline", () => {
    localStorage.setItem("logbook_grade_scale_reports_boulder", "v-scale");
    localStorage.setItem("logbook_grade_scale_reports_sport", "uiaa");
    const picker = mount();
    expect(picker.getScaleId()).toBe("v-scale");
    expect(picker.getScaleIdFor("sport")).toBe("uiaa");
  });

  it("falls back to the discipline default for a garbage/cross-discipline stored value", () => {
    localStorage.setItem("logbook_grade_scale_reports_boulder", "not-a-real-scale");
    localStorage.setItem("logbook_grade_scale_reports_sport", "v-scale"); // real scale, but Boulder's, not Sport's
    const picker = mount();
    expect(picker.getScaleId()).toBe("font");
    expect(picker.getScaleIdFor("sport")).toBe("french");
  });

  it("falls back to the discipline default for a stored Non-standard preference", () => {
    localStorage.setItem("logbook_grade_scale_reports_boulder", "font-non-standard");
    localStorage.setItem("logbook_grade_scale_reports_sport", "french-non-standard");
    const picker = mount();
    expect(picker.getScaleId()).toBe("font");
    expect(picker.getScaleIdFor("sport")).toBe("french");
  });

  it("refresh() updates the trigger label and fires onChange when the discipline switch changes the resolved scale", () => {
    localStorage.setItem("logbook_grade_scale_reports_boulder", "v-scale");
    const onChange = vi.fn();
    const picker = mount(onChange);
    expect(picker.getScaleId()).toBe("v-scale");
    expect(containerEl.querySelector("#report-grade-scale-btn-label").textContent).toBe("V-scale (Hueco)");

    activeType = "sport";
    picker.refresh();
    expect(onChange).toHaveBeenCalledWith("french");
    expect(containerEl.querySelector("#report-grade-scale-btn-label").textContent).toBe("French");
  });

  it("refresh() does NOT fire onChange when the switch resolves to the same scale id", () => {
    const onChange = vi.fn();
    const picker = mount(onChange);
    activeType = "boulder"; // same as construction-time active type
    picker.refresh();
    expect(onChange).not.toHaveBeenCalled();
  });
});
