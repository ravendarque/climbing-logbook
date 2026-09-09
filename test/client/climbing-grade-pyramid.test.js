// @vitest-environment happy-dom
//
// #633 -- the health-card message-selection logic (climbing-grade-
// pyramid.js's own #render(), the promoted/gapRow/topHeavyRow/healthy
// branches) had no test coverage at all before this file, which is
// exactly how the confirmed bug (a top-heavy pyramid -- no literal
// zero-count tier, but a harder tier with more sends than an easier one
// beneath it -- rendered "No gaps... every tier has sends behind it",
// a false "healthy" read) went unnoticed. happy-dom, same reasoning
// test/client/climbing-entries-table.test.js gives: this component
// renders real DOM and needs a document, which the Cloudflare Workers
// pool (vitest.config.js's default) doesn't have.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import "../../client/components/climbing-grade-pyramid.js";

let el;

// top4 is ordered hardest (index 0) to easiest-of-the-four (index 3),
// matching PYRAMID_IDEAL_BY_POSITION's own [1,2,4,8] ordering.
function pyramidData(top4, overrides = {}) {
  return {
    boulder: { top4, lower: [], hasSends: true, promotedGrade: null, ...overrides },
    sport: { top4: [], lower: [], hasSends: false, promotedGrade: null },
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
    el.pyramidData = { boulder: { top4: [], lower: [], hasSends: false, promotedGrade: null }, sport: { top4: [], lower: [], hasSends: false, promotedGrade: null } };
    expect(el.querySelector("#pyramid").textContent).toContain("No Boulder sends logged");
    expect(el.querySelector("#health-card").innerHTML).toBe("");
  });

  it("#633 -- flags a top-heavy pyramid (no zero tiers, but a harder tier outsends an easier one) instead of reporting it as gap-free", () => {
    // Hardest tier (ideal 1) has 6 sends, easiest-of-four tier (ideal 8)
    // has only 1 -- every tier is non-zero, so the old gapRow-only check
    // would have called this "No gaps... healthy", even though it's
    // inverted relative to the 8-4-2-1 shape.
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
