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
  it("shows a loading spinner, not the no-sends state, until it has a report (#1387)", () => {
    const fresh = document.createElement("climbing-grade-pyramid");
    document.body.append(fresh);
    expect(fresh.querySelector("#pyramid [data-loading]")).not.toBeNull();
    expect(fresh.querySelector("#pyramid").textContent).not.toContain("No Boulder sends logged");
    fresh.remove();
  });

  it("shows the no-sends state when hasSends is false", () => {
    el.pyramidData = {
      boulder: { top4: [], hasSends: false, promotedGrade: null },
      sport: { top4: [], hasSends: false, promotedGrade: null },
    };
    expect(el.querySelector("#pyramid .haiku").textContent).toBe(
      "You have logged no sendsWithin this report's windowFrom Font 3 upwards",
    );
    expect(el.querySelector("#pyramid-insights").innerHTML).toBe("");
  });

  it("#633 -- flags a top-heavy pyramid (no zero tiers, but a harder tier outsends an easier one) instead of reporting it as gap-free", () => {
    el.pyramidData = pyramidData([
      { grade: "7C", count: 6 },
      { grade: "7B", count: 4 },
      { grade: "7A", count: 2 },
      { grade: "6C", count: 1 },
    ]);
    const health = el.querySelector("#pyramid-insights").textContent;
    expect(health).toContain("Your pyramid is top-heavy");
    expect(health).toContain("fewer sends at 7B (4) than at 7C, the harder tier above it (6)");
    expect(health).toContain("Bringing 7B up to 6 sends would balance it.");
    expect(health).not.toContain("No gaps");
    expect(el.querySelector("[data-insight-tone]").dataset.insightTone).toBe("negative");
  });

  it("reports a literal gap (a zero-count tier) with its own message, taking priority over the top-heavy check", () => {
    el.pyramidData = pyramidData([
      { grade: "7C", count: 1 },
      { grade: "7B", count: 0 },
      { grade: "7A", count: 2 },
      { grade: "6C", count: 4 },
    ]);
    const health = el.querySelector("#pyramid-insights").textContent;
    expect(health).toContain("Your pyramid has a gap");
    expect(health).toContain("You haven't logged any sends at 7B in the past 12 months");
    expect(health).toContain("2 sends at 7B would complete the tier.");
    expect(health).not.toContain("top-heavy");
    expect(el.querySelector("[data-insight-tone]").dataset.insightTone).toBe("negative");
  });

  it("reports a healthy shape when every tier is non-zero and non-increasing toward the base", () => {
    el.pyramidData = pyramidData([
      { grade: "7C", count: 1 },
      { grade: "7B", count: 2 },
      { grade: "7A", count: 4 },
      { grade: "6C", count: 8 },
    ]);
    const health = el.querySelector("#pyramid-insights").textContent;
    expect(health).toContain("No gaps or inversions");
    expect(el.querySelector("[data-insight-tone]").dataset.insightTone).toBe("positive");
    expect(health).toContain("Building your pyramid");
    expect(health).not.toContain("furthest from its target");
  });

  it("names the tier furthest from its target when a healthy pyramid isn't full yet", () => {
    el.pyramidData = pyramidData([
      { grade: "7C", count: 1 },
      { grade: "7B", count: 2 },
      { grade: "7A", count: 3 },
      { grade: "6C", count: 3 },
    ]);
    expect(el.querySelector("#pyramid-insights").textContent).toContain(
      "6C is furthest from its target (3 of 8 sends), so extra sends there will do the most to fill it out.",
    );
  });

  it("a tier tying the count of the tier above it is still healthy (only a strict decrease counts as top-heavy)", () => {
    el.pyramidData = pyramidData([
      { grade: "7C", count: 3 },
      { grade: "7B", count: 3 },
      { grade: "7A", count: 3 },
      { grade: "6C", count: 3 },
    ]);
    const health = el.querySelector("#pyramid-insights").textContent;
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
      { promotedGrade: "8A" },
    );
    const health = el.querySelector("#pyramid-insights").textContent;
    expect(health).toContain("You've built a full pyramid!");
    expect(health).toContain("Consider pushing up to 8A if you feel ready.");
    expect(el.querySelector("[data-insight-tone]").dataset.insightTone).toBe("positive");
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
