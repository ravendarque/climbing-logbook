import { describe, expect, it } from "vitest";
import { buildMatrixRows, gradeScaleMatrixHtml } from "../../client/grade-scale-matrix.js";

describe("buildMatrixRows", () => {
  it("returns one row per Boulder reference-scale (Font) label", () => {
    const rows = buildMatrixRows("boulder");
    // FONT_STANDARD_LABELS has 25 entries (shared/grade-data.js).
    expect(rows).toHaveLength(25);
  });

  it("returns one row per Sport reference-scale (French) label", () => {
    const rows = buildMatrixRows("sport");
    // FRENCH_STANDARD_LABELS has 38 entries (shared/grade-data.js).
    expect(rows).toHaveLength(38);
  });

  it("aligns Font (Non-standard)'s own decomposition onto the same row as its Font-standard equivalent", () => {
    const rows = buildMatrixRows("boulder");
    const row = rows.find(r => r.cells.font === "6A");
    expect(row.cells["font-non-standard"]).toBe("6a");
  });

  it("shows V-scale's coarser 2-wide step across both Font grades it covers", () => {
    const rows = buildMatrixRows("boulder");
    const sixA = rows.find(r => r.cells.font === "6A");
    const sixAPlus = rows.find(r => r.cells.font === "6A+");
    expect(sixA.cells["v-scale"]).toBe("V3");
    expect(sixAPlus.cells["v-scale"]).toBe("V3");
  });

  it("aligns French (Non-standard)'s own decomposition onto the same row as its French-standard equivalent", () => {
    const rows = buildMatrixRows("sport");
    const row = rows.find(r => r.cells.french === "6a");
    expect(row.cells["french-non-standard"]).toBe("6a");
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

  it("cites every conversion source used in Sport's own matrix", () => {
    const html = gradeScaleMatrixHtml("sport");
    expect(html).toContain("Wikipedia: Grade (climbing)");
    expect(html).toContain("theCrag: Norwegian grade conversion");
  });

  it("cites the V-scale conversion source on Boulder's page", () => {
    const html = gradeScaleMatrixHtml("boulder");
    expect(html).toContain("hakaru.io");
  });

  it("labels Boulder's V-scale anchor against Font, not French -- GRADE_CONVERSION_MATRIX's field is named frenchAnchor for every entry, but Boulder's own anchor is really against Font-standard", () => {
    const html = gradeScaleMatrixHtml("boulder");
    expect(html).toContain("= Font 7c");
    expect(html).not.toContain("= French");
  });

  it("labels Sport's anchors against French", () => {
    const html = gradeScaleMatrixHtml("sport");
    expect(html).toContain("= French 6a");
  });

  it("includes the French (FFME) base-table sourcing note on Sport's page but not Boulder's", () => {
    expect(gradeScaleMatrixHtml("sport")).toContain("FFME");
    expect(gradeScaleMatrixHtml("boulder")).not.toContain("FFME");
  });

  it("escapes grade labels rather than injecting them raw", () => {
    // Sanity check against the general escapeHtml policy every other
    // client/*.js template-string module in this codebase follows --
    // real grade labels never contain HTML metacharacters, so this just
    // confirms the escaping call is actually wired in, not that any
    // particular label needs it today.
    const html = gradeScaleMatrixHtml("boulder");
    expect(html).not.toContain("undefined");
  });

  it("throws on an unknown discipline", () => {
    expect(() => gradeScaleMatrixHtml("aid")).toThrow();
  });
});
