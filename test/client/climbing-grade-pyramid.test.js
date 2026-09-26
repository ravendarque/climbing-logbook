// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import "../../client/components/climbing-grade-pyramid.js";

let el;

function pyramidData(top4, overrides = {}) {
  return {
    boulder: { top4, hasSends: true, promotedGrade: null, ...overrides },
    sport: { top4: [], hasSends: false, promotedGrade: null },
  };
}

beforeEach(() => {
  el = document.createElement("climbing-grade-pyramid");
  document.body.append(el);
});

afterEach(() => {
  el.remove();
});

describe("ClimbingGradePyramid health card", () => {
  it("shows the no-sends state when hasSends is false", () => {
    el.pyramidData = { boulder: { top4: [], hasSends: false, promotedGrade: null }, sport: { top4: [], hasSends: false, promotedGrade: null } };
    expect(el.querySelector("#pyramid").textContent).toContain("No Boulder sends logged");
    expect(el.querySelector("#health-card").innerHTML).toBe("");
  });

  it("#633 -- flags a top-heavy pyramid (no zero tiers, but a harder tier outsends an easier one) instead of reporting it as gap-free", () => {
    el.pyramidData = pyramidData([
      { grade: "7C", count: 6 },
      { grade: "7B", count: 4 },
      { grade: "7A", count: 2 },
      { grade: "6C", count: 1 },
    ]);
    const health = el.querySelector("#health-card").textContent;
    expect(health).toContain("top-heavy");
    expect(health).not.toContain("No gaps");
  });

  it("reports a literal gap (a zero-count tier) with its own message, taking priority over the top-heavy check", () => {
    el.pyramidData = pyramidData([
      { grade: "7C", count: 1 },
      { grade: "7B", count: 0 },
      { grade: "7A", count: 2 },
      { grade: "6C", count: 4 },
    ]);
    const health = el.querySelector("#health-card").textContent;
    expect(health).toContain("No sends logged at 7B");
    expect(health).not.toContain("top-heavy");
  });

  it("reports a healthy shape when every tier is non-zero and non-increasing toward the base", () => {
    el.pyramidData = pyramidData([
      { grade: "7C", count: 1 },
      { grade: "7B", count: 2 },
      { grade: "7A", count: 4 },
      { grade: "6C", count: 8 },
    ]);
    const health = el.querySelector("#health-card").textContent;
    expect(health).toContain("No gaps or inversions");
  });

  it("a tier tying the count of the tier above it is still healthy (only a strict decrease counts as top-heavy)", () => {
    el.pyramidData = pyramidData([
      { grade: "7C", count: 3 },
      { grade: "7B", count: 3 },
      { grade: "7A", count: 3 },
      { grade: "6C", count: 3 },
    ]);
    const health = el.querySelector("#health-card").textContent;
    expect(health).toContain("No gaps or inversions");
  });

  it("promoted takes priority over both the gap and top-heavy checks", () => {
    el.pyramidData = pyramidData(
      [
        { grade: "7C", count: 6 },
        { grade: "7B", count: 1 },
        { grade: "7A", count: 2 },
        { grade: "6C", count: 4 },
      ],
      { promotedGrade: "8A" }
    );
    const health = el.querySelector("#health-card").textContent;
    expect(health).toContain("ready to push into 8A");
  });
});

describe("ClimbingGradePyramid viewScaleId", () => {
  it("renders row grades verbatim, regardless of viewScaleId -- the server already converted them", () => {
    el.pyramidData = pyramidData([{ grade: "V3", count: 3 }]);
    el.viewScaleId = "v-scale";
    expect(el.querySelector("#pyramid").textContent).toContain("V3");
  });

  it("colors a row consistently for the same real difficulty, regardless of which scale its grade is expressed in", () => {
    const extractBg = html => html.match(/background:([^;"]+)/)[1];

    el.pyramidData = pyramidData([{ grade: "6A", count: 1 }]);
    el.viewScaleId = "font";
    const fontBg = extractBg(el.querySelector("#pyramid").innerHTML);

    el.pyramidData = pyramidData([{ grade: "V3", count: 1 }]);
    el.viewScaleId = "v-scale";
    const vScaleBg = extractBg(el.querySelector("#pyramid").innerHTML);

    expect(vScaleBg).toBe(fontBg);
  });
});
