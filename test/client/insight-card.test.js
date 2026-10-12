import { describe, expect, it } from "vitest";
import { insightsHtml } from "../../client/insight-card.js";

describe("insightsHtml (#1375)", () => {
  it("stacks one card per insight, in order, each carrying its tone", () => {
    const html = insightsHtml([
      { tone: "warning", text: "First", detail: "Why" },
      { tone: "info", text: "Second" },
    ]);
    expect([...html.matchAll(/data-insight-tone="(\w+)"/g)].map(m => m[1])).toEqual(["warning", "info"]);
    expect(html.indexOf("First")).toBeLessThan(html.indexOf("Second"));
    expect(html).toContain("Why");
  });

  it("escapes the text and treats an unknown tone as info", () => {
    const html = insightsHtml([{ tone: "loud", text: "<b>x</b>" }]);
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(html).toContain('data-insight-tone="info"');
  });

  it("renders nothing when there are no insights", () => {
    expect(insightsHtml([])).toBe("");
    expect(insightsHtml([null])).toBe("");
  });
});
