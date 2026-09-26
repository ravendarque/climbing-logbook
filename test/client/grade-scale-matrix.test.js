import { describe, expect, it } from "vitest";
import { buildMatrixRows, gradeScaleMatrixHtml, gradeScaleSourcesHtml } from "../../client/grade-scale-matrix.js";

describe("buildMatrixRows", () => {
  it("returns one row per Boulder reference-scale (Font) label, plus the below-range aggregate row", () => {
    const rows = buildMatrixRows("boulder");
    expect(rows).toHaveLength(26);
  });

  it("returns one row per Sport reference-scale (French) label -- no aggregate row, French-standard already labels its lowest numbers", () => {
    const rows = buildMatrixRows("sport");
    expect(rows).toHaveLength(38);
  });

  it("the below-range row has no Font or V-scale value, and a descriptive (not enumerated) Non-standard entry", () => {
    const rows = buildMatrixRows("boulder");
    const belowRange = rows[0];
    expect(belowRange.cells.font).toBeNull();
    expect(belowRange.cells["v-scale"]).toBeNull();
    expect(belowRange.cells["font-non-standard"]).toBe("number (1/2), letter (optional, a/b/c), modifier (optional -/+)");
  });

  it("groups every Non-standard sub-position that rounds to a Font row into that row's own comma-separated list, not a single always-identical value", () => {
    const rows = buildMatrixRows("boulder");
    const row = rows.find(r => r.cells.font === "6A");
    const grouped = row.cells["font-non-standard"].split(", ");
    expect(grouped).toContain("6a");
    expect(grouped.length).toBeGreaterThan(1);
  });

  it("every Font row's Non-standard list stays lowercase -- nonStandardLabel()'s own casing, not re-cased to match Font-standard's uppercase convention", () => {
    const rows = buildMatrixRows("boulder");
    const row = rows.find(r => r.cells.font === "7B+");
    expect(row.cells["font-non-standard"]).not.toMatch(/[A-Z]/);
  });

  it("shows V-scale's coarser 2-wide step across both Font grades it covers", () => {
    const rows = buildMatrixRows("boulder");
    const sixA = rows.find(r => r.cells.font === "6A");
    const sixAPlus = rows.find(r => r.cells.font === "6A+");
    expect(sixA.cells["v-scale"]).toBe("V3");
    expect(sixAPlus.cells["v-scale"]).toBe("V3");
  });

  it("groups every Non-standard sub-position that rounds to a French row into that row's own comma-separated list, staying lowercase to match French-standard's own casing", () => {
    const rows = buildMatrixRows("sport");
    const row = rows.find(r => r.cells.french === "6a");
    const grouped = row.cells["french-non-standard"].split(", ");
    expect(grouped).toContain("6a");
    expect(row.cells["french-non-standard"]).not.toMatch(/[A-Z]/);
  });

  it("resolves UIAA's sourced anchor (VI+ = 6a) on the matching French row", () => {
    const rows = buildMatrixRows("sport");
    const row = rows.find(r => r.cells.french === "6a");
    expect(row.cells.uiaa).toBe("VI+");
  });

  it("throws on an unknown discipline", () => {
    expect(() => buildMatrixRows("aid")).toThrow();
  });
});

describe("gradeScaleMatrixHtml", () => {
  it("renders a table column for every Boulder scale", () => {
    const html = gradeScaleMatrixHtml("boulder");
    expect(html).toContain("Font</th>");
    expect(html).toContain("Font (Non-standard)</th>");
    expect(html).toContain("V-scale (Hueco)</th>");
  });

  it("renders a table column for every Sport scale", () => {
    const html = gradeScaleMatrixHtml("sport");
    expect(html).toContain("French</th>");
    expect(html).toContain("UIAA</th>");
    expect(html).toContain("YDS</th>");
    expect(html).toContain("Norwegian</th>");
    expect(html).toContain("Australian (Ewbank)</th>");
  });

  it("renders the below-range row's blank Font/V-scale cells with the standard blank-cell marker", () => {
    const html = gradeScaleMatrixHtml("boulder");
    expect(html).toContain('<span class="text-muted">—</span>');
  });

  it("includes the French (FFME) base-table sourcing note on Sport's page but not Boulder's", () => {
    expect(gradeScaleMatrixHtml("sport")).toContain("FFME");
    expect(gradeScaleMatrixHtml("boulder")).not.toContain("FFME");
  });

  it("does not include a Sources section -- gradeScaleSourcesHtml renders that separately", () => {
    expect(gradeScaleMatrixHtml("boulder")).not.toContain("sources-heading");
    expect(gradeScaleMatrixHtml("sport")).not.toContain("sources-heading");
  });

  it("escapes grade labels rather than injecting them raw", () => {
    const html = gradeScaleMatrixHtml("boulder");
    expect(html).not.toContain("undefined");
  });

  it("throws on an unknown discipline", () => {
    expect(() => gradeScaleMatrixHtml("aid")).toThrow();
  });
});

describe("gradeScaleSourcesHtml", () => {
  it("uses the sources-heading utility, not a bare heading", () => {
    expect(gradeScaleSourcesHtml()).toContain('class="sources-heading"');
  });

  it("is one shared list across both disciplines, not split per discipline", () => {
    const html = gradeScaleSourcesHtml();
    expect(html.match(/sources-heading/g)).toHaveLength(1);
    expect(html).not.toContain("Sources —");
  });

  it("cites every distinct source used anywhere in GRADE_CONVERSION_MATRIX", () => {
    const html = gradeScaleSourcesHtml();
    expect(html).toContain("Wikipedia: Grade (climbing)");
    expect(html).toContain("theCrag: Norwegian grade conversion");
    expect(html).toContain("Rockfax");
  });

  it("does not repeat the underlying grade-conversion pairs -- the source name and a short description only", () => {
    const html = gradeScaleSourcesHtml();
    expect(html).not.toContain("= French");
    expect(html).not.toContain("= Font");
  });
});
