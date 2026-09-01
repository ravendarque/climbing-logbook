import { describe, expect, it } from "vitest";
import { renderComboChartHtml } from "../../client/combo-chart.js";

describe("renderComboChartHtml", () => {
  it("renders the headline sentence", () => {
    const html = renderComboChartHtml({ bucketLabels: ["Jan 2026"], bars: [{ label: "Sends", values: [3] }], lines: [], headline: "3 sends this month." });
    expect(html).toContain("3 sends this month.");
  });

  it("renders one <rect> per bar value", () => {
    const html = renderComboChartHtml({ bucketLabels: ["Jan 2026", "Feb 2026"], bars: [{ label: "Sends", values: [3, 5] }], lines: [], headline: "h" });
    const rectCount = (html.match(/<rect/g) || []).length;
    expect(rectCount).toBe(2);
  });

  it("renders a taller bar for a larger value", () => {
    const html = renderComboChartHtml({ bucketLabels: ["Jan 2026", "Feb 2026"], bars: [{ label: "Sends", values: [2, 8] }], lines: [], headline: "h" });
    const heights = [...html.matchAll(/<rect[^>]*height="([\d.]+)"/g)].map(m => Number(m[1]));
    expect(heights).toHaveLength(2);
    expect(heights[1]).toBeGreaterThan(heights[0]);
  });

  it("renders a numeric data label on each bar", () => {
    const html = renderComboChartHtml({ bucketLabels: ["Jan 2026"], bars: [{ label: "Sends", values: [7] }], lines: [], headline: "h" });
    expect(html).toContain(">7<");
  });

  it("renders every bucket label on the x-axis", () => {
    const html = renderComboChartHtml({ bucketLabels: ["Jan 2026", "Feb 2026", "Mar 2026"], bars: [{ label: "Sends", values: [1, 2, 3] }], lines: [], headline: "h" });
    expect(html).toContain("Jan 2026");
    expect(html).toContain("Feb 2026");
    expect(html).toContain("Mar 2026");
  });

  it("renders a line point's display label, not its position key", () => {
    const html = renderComboChartHtml({
      bucketLabels: ["Jan 2026"],
      bars: [{ label: "Sends", values: [1] }],
      lines: [{ label: "Max grade", points: [{ positionKey: "6B", displayLabel: "V4" }], positionOrder: ["5", "6A", "6B", "6C"] }],
      headline: "h",
    });
    expect(html).toContain(">V4<");
    expect(html).not.toContain(">6B<");
  });

  it("positions a higher positionOrder index visually higher (smaller SVG y)", () => {
    const html = renderComboChartHtml({
      bucketLabels: ["Jan 2026", "Feb 2026"],
      bars: [{ label: "Sends", values: [1, 1] }],
      lines: [{
        label: "Max grade",
        points: [{ positionKey: "5", displayLabel: "V0" }, { positionKey: "6C", displayLabel: "V5" }],
        positionOrder: ["5", "6A", "6B", "6C"],
      }],
      headline: "h",
    });
    const circles = [...html.matchAll(/<circle[^>]*cy="([\d.]+)"/g)].map(m => Number(m[1]));
    expect(circles).toHaveLength(2);
    expect(circles[1]).toBeLessThan(circles[0]); // "6C" (index 3) is higher on the chart than "5" (index 0) -- smaller SVG y
  });

  it("skips a null point in a line series without throwing", () => {
    const html = renderComboChartHtml({
      bucketLabels: ["Jan 2026", "Feb 2026"],
      bars: [{ label: "Sends", values: [0, 1] }],
      lines: [{ label: "Max grade", points: [null, { positionKey: "6A", displayLabel: "V3" }], positionOrder: ["5", "6A"] }],
      headline: "h",
    });
    const circleCount = (html.match(/<circle/g) || []).length;
    expect(circleCount).toBe(1);
  });

  it("handles an all-zero bar series without dividing by zero", () => {
    expect(() => renderComboChartHtml({ bucketLabels: ["Jan 2026"], bars: [{ label: "Sends", values: [0] }], lines: [], headline: "h" })).not.toThrow();
  });

  it("handles a positionOrder of length 1 without dividing by zero", () => {
    const html = renderComboChartHtml({
      bucketLabels: ["Jan 2026"],
      bars: [{ label: "Sends", values: [1] }],
      lines: [{ label: "Max grade", points: [{ positionKey: "6A", displayLabel: "V3" }], positionOrder: ["6A"] }],
      headline: "h",
    });
    expect(html).toContain(">V3<");
  });

  it("renders y-axis tick label text for a bar series with a real max value", () => {
    const html = renderComboChartHtml({ bucketLabels: ["Jan 2026"], bars: [{ label: "Sends", values: [10] }], lines: [], headline: "h" });
    // ticks at 0, midpoint (5), and max (10)
    expect(html).toContain(">5<");
    expect(html).toContain(">10<");
  });

  it("renders no axis-related output when there are no bar series", () => {
    const html = renderComboChartHtml({
      bucketLabels: ["Jan 2026"],
      bars: [],
      lines: [{ label: "Max grade", points: [{ positionKey: "6A", displayLabel: "V3" }], positionOrder: ["6A"] }],
      headline: "h",
    });
    // only the pre-existing plot-area baseline <line> should be present, no axis gridlines
    const lineCount = (html.match(/<line/g) || []).length;
    expect(lineCount).toBe(1);
  });

  it("#603 -- renders a null bar value as a dash, not a zero-height rect", () => {
    const html = renderComboChartHtml({ bucketLabels: ["Jan 2026"], bars: [{ label: "Avg attempts", values: [null] }], lines: [], headline: "h" });
    const rectCount = (html.match(/<rect/g) || []).length;
    expect(rectCount).toBe(0);
    expect(html).toContain(">–<");
    // Not asserting the whole SVG never contains ">0<" -- the y-axis's own
    // legitimate baseline tick label (barYAxisHtml, unaffected by this
    // fix) still renders "0" when maxValue defaults to 0 for an all-null
    // series. This only checks the bar's own data-label slot specifically
    // renders a dash instead of a number.
  });

  it("#603 -- a bucket with a null bar value and a real grade-line point renders both correctly", () => {
    const html = renderComboChartHtml({
      bucketLabels: ["Jan 2026"],
      bars: [{ label: "Avg attempts", values: [null] }],
      lines: [{ label: "Max grade", points: [{ positionKey: "6B", displayLabel: "V4" }], positionOrder: ["5", "6B"] }],
      headline: "h",
    });
    expect(html).toContain(">–<");
    expect(html).toContain(">V4<");
    const circleCount = (html.match(/<circle/g) || []).length;
    expect(circleCount).toBe(1);
  });

  it("#603 -- a null bar value doesn't distort the y-axis scale computed from real values", () => {
    const html = renderComboChartHtml({ bucketLabels: ["Jan 2026", "Feb 2026"], bars: [{ label: "Avg attempts", values: [null, 10] }], lines: [], headline: "h" });
    // ticks at 0, midpoint (5), and max (10) -- unaffected by the null bucket
    expect(html).toContain(">5<");
    expect(html).toContain(">10<");
  });

  it("#603 -- an all-null bar series doesn't throw and produces no rects", () => {
    const html = renderComboChartHtml({ bucketLabels: ["Jan 2026", "Feb 2026"], bars: [{ label: "Avg attempts", values: [null, null] }], lines: [], headline: "h" });
    const rectCount = (html.match(/<rect/g) || []).length;
    expect(rectCount).toBe(0);
    const dashCount = (html.match(/>–</g) || []).length;
    expect(dashCount).toBe(2);
  });

  it("renders multiple bar series side by side within the same bucket slot, not stacked", () => {
    const html = renderComboChartHtml({
      bucketLabels: ["Jan 2026"],
      bars: [{ label: "A", values: [3] }, { label: "B", values: [5] }],
      lines: [],
      headline: "h",
    });
    const xs = [...html.matchAll(/<rect[^>]*x="([\d.]+)"/g)].map(m => Number(m[1]));
    expect(xs).toHaveLength(2);
    expect(xs[0]).not.toBe(xs[1]);
  });
});
