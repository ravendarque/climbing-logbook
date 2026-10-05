import { describe, expect, it } from "vitest";
import { TOUR_STEPS } from "../../client/tour/steps.js";
import { readTourRequest, TOUR_FIRST_PAGE, tourStartUrl, tourUrl } from "../../client/tour/tour-url.js";

const loc = (pathname, search) => ({ pathname, search, origin: "https://my.climbinglogbook.com" });

describe("tourUrl", () => {
  it("numbers steps from 1 and carries the page to return to", () => {
    expect(tourUrl({ user: "advanceddemo", page: "map", step: 3, returnTo: "/raven/account" })).toBe(
      "/advanceddemo/map?tour=4&returnTo=%2Fraven%2Faccount",
    );
  });

  it("omits returnTo when there isn't one", () => {
    expect(tourUrl({ user: "beginnerdemo", page: "log", step: 0 })).toBe("/beginnerdemo/log?tour=1");
  });

  it("starts on the first step's page, on the default demo logbook", () => {
    expect(tourStartUrl("/raven/account")).toBe("/intermediatedemo/log?tour=1&returnTo=%2Fraven%2Faccount");
    expect(TOUR_STEPS[0].page).toBe(TOUR_FIRST_PAGE);
  });
});

describe("readTourRequest", () => {
  it("reads the step and returnTo on a demo account's page", () => {
    expect(readTourRequest(loc("/beginnerdemo/log", "?tour=3&returnTo=%2Fraven%2Faccount"), 4)).toEqual({
      user: "beginnerdemo",
      step: 2,
      returnTo: "/raven/account",
    });
  });

  it("is null without a tour parameter", () => {
    expect(readTourRequest(loc("/beginnerdemo/log", ""), 4)).toBeNull();
  });

  it("is null on anyone else's page, so the tour never runs over a real logbook", () => {
    expect(readTourRequest(loc("/raven/log", "?tour=1"), 4)).toBeNull();
  });

  it("clamps a step outside the tour, and falls back to the first for rubbish", () => {
    expect(readTourRequest(loc("/beginnerdemo/log", "?tour=99"), 4).step).toBe(3);
    expect(readTourRequest(loc("/beginnerdemo/log", "?tour=0"), 4).step).toBe(0);
    expect(readTourRequest(loc("/beginnerdemo/log", "?tour=abc"), 4).step).toBe(0);
  });

  it("ignores a returnTo that leaves the site", () => {
    expect(
      readTourRequest(loc("/beginnerdemo/log", "?tour=1&returnTo=https%3A%2F%2Fevil.example"), 4).returnTo,
    ).toBeNull();
    expect(readTourRequest(loc("/beginnerdemo/log", "?tour=1&returnTo=%2F%2Fevil.example"), 4).returnTo).toBeNull();
  });
});

describe("TOUR_STEPS", () => {
  it("each has a page, a target, a title and a body", () => {
    for (const step of TOUR_STEPS) {
      expect(["log", "map", "performance"]).toContain(step.page);
      expect(step.target).toBeTruthy();
      expect(step.title).toBeTruthy();
      expect(step.body).toBeTruthy();
    }
  });
});
