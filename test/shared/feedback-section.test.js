import { describe, expect, it } from "vitest";
import { feedbackSection } from "../../shared/feedback-section.js";

const at = path => `https://my.climbinglogbook.com${path}`;

describe("feedbackSection", () => {
  it.each([
    ["/raven/log", "logbook"],
    ["/raven/view", "logbook"],
    ["/raven/view/map", "map"],
    ["/raven/performance", "performance"],
    ["/raven/performance/pyramid/", "performance"],
    ["/raven/account", "account"],
    ["/raven/account/places", "account"],
    ["/raven/account/import-export", "import_export"],
    ["/raven", "public_logbook"],
    ["/raven/", "public_logbook"],
  ])("maps %s to %s", (path, section) => {
    expect(feedbackSection(at(path))).toBe(section);
  });

  it("maps a help page on the apex to help", () => {
    expect(feedbackSection("https://climbinglogbook.com/help/grade-scales/")).toBe("help");
  });

  it.each([["/raven/sync"], ["/raven/welcome"], ["/"]])("leaves %s unset", path => {
    expect(feedbackSection(at(path))).toBe("");
  });

  it.each([["/launch/"], ["/register/"]])("doesn't take an apex page (%s) for a public logbook", path => {
    expect(feedbackSection(`https://climbinglogbook.com${path}`)).toBe("");
  });

  it.each([[""], ["not a url"], [undefined]])("leaves a missing or unreadable referrer (%s) unset", referrer => {
    expect(feedbackSection(referrer)).toBe("");
  });
});
