import { describe, expect, it } from "vitest";
import { strengthsFor } from "../../shared/strengths-stats.js";
import { buildStrengthsReport } from "../../shared/reports.js";

let nextId = 0;
const climb = (wallAngle, grade, hardestBeta = "", status = "send", type = "boulder") => ({
  id: String(nextId++),
  type,
  grade,
  gradeScale: type === "boulder" ? "font" : "french",
  status,
  wallAngle,
  hardestBeta,
});
const angle = (report, name) => report.angles.find(a => a.angle === name);

describe("strengthsFor (#1523)", () => {
  it("sets the level on an angle from the median of the best five sends there", () => {
    const report = strengthsFor("boulder", [
      ...["7A+", "7A+", "7A", "7A", "6C+", "6A"].map(g => climb("overhang", g)),
      climb("overhang", "7C", "", "project"),
    ]);
    expect(angle(report, "overhang")).toMatchObject({ climbs: 7, share: 100, level: "7A" });
  });

  it("needs three sends on an angle before it has a level", () => {
    const report = strengthsFor("boulder", [climb("slab", "6A"), climb("slab", "6A"), climb("vert", "6B")]);
    expect(angle(report, "slab").level).toBeNull();
    expect(angle(report, "slab").share).toBe(67);
  });

  it("leaves out checkouts, climbs with no wall angle and the other discipline", () => {
    const report = strengthsFor("boulder", [
      climb("slab", "6A"),
      climb("slab", "6A", "", "checkout"),
      climb(null, "6A"),
      climb("slab", "6a", "", "send", "sport"),
    ]);
    expect(report.climbs).toBe(1);
  });

  it("counts a crux as below your level two or more grades under it, and at your limit otherwise", () => {
    const sends = ["7A", "7A", "7A"].map(g => climb("overhang", g));
    const report = strengthsFor("boulder", [
      ...sends,
      climb("overhang", "6B+", "cross to the sloper"),
      climb("overhang", "6B", "paddle to the sloper"),
      climb("overhang", "6C+", "deadpoint to the sloper"),
    ]);
    expect(report.items.find(i => i.id === "sloper")).toMatchObject({ below: 2, limit: 1 });
  });

  it("only lists something once it's in the hardest move of three or more climbs", () => {
    const report = strengthsFor("boulder", [
      climb("vert", "6A", "dyno to the jug"),
      climb("vert", "6A", "dyno to the jug"),
      climb("vert", "6A", "crimp"),
    ]);
    expect(report.items.map(i => i.id)).toEqual([]);
    expect(report.described).toBe(3);
  });

  it("counts the holds in each hardest move by wall angle", () => {
    const report = strengthsFor("boulder", [
      climb("slab", "6A", "mantle onto the sloper"),
      climb("overhang", "6A", "deadpoint to the sloper"),
      climb("overhang", "6A", "cross to the crimp"),
    ]);
    expect(report.heat.find(r => r.id === "sloper").counts).toEqual([1, 0, 1, 0, 0, 0]);
    expect(report.heat.find(r => r.id === "crimp").counts).toEqual([0, 0, 1, 0, 0, 0]);
  });

  it("names the weak angle, what's hard below your level and what's only hard at your limit", () => {
    const report = strengthsFor("boulder", [
      ...["7A", "7A", "7A"].map(g => climb("overhang", g, "right heel hook on the lip, deadpoint to the crimp")),
      ...["6A", "6A", "6A"].map(g => climb("slab", g)),
      ...["6A", "6A", "6B"].map(g => climb("overhang", g, "paddle to the sloper", "project")),
    ]);
    expect(report.insights.map(i => [i.tone, i.title])).toEqual([
      ["negative", "Slab is your weak angle"],
      ["negative", "Paddle: hard below your level"],
      ["positive", "Deadpoint: only at your limit"],
    ]);
    expect(report.insights[0].text).toBe(
      "Your level on slab is 6A, against 7A on overhang. Climbing more slab is the quickest way up.",
    );
  });

  it("says nothing with no climbs", () => {
    expect(strengthsFor("sport", [])).toMatchObject({ climbs: 0, items: [], heat: [], insights: [] });
  });
});

describe("buildStrengthsReport", () => {
  it("reports each discipline separately", () => {
    const report = buildStrengthsReport([climb("slab", "6A"), climb("roof", "7a", "", "send", "sport")]);
    expect(report.boulder.climbs).toBe(1);
    expect(report.sport.climbs).toBe(1);
  });
});
