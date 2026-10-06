import { describe, expect, it } from "vitest";
import { TOUR_STEPS } from "../../client/tour/steps.js";
import {
  carryTourParams,
  isOnPage,
  readTourRequest,
  restoreTourParams,
  TOUR_FIRST_PAGE,
  tourStartUrl,
  tourUrl,
} from "../../client/tour/tour-url.js";

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

  it("handles a two-part page", () => {
    expect(tourUrl({ user: "raven", page: "view/map", step: 4 })).toBe("/raven/view/map?tour=5");
  });

  it("starts on the first step's page, on the given account", () => {
    expect(tourStartUrl("raven", "/raven/account")).toBe("/raven/log?tour=1&returnTo=%2Fraven%2Faccount");
    expect(TOUR_STEPS[0].page).toBe(TOUR_FIRST_PAGE);
  });
});

describe("isOnPage", () => {
  it("matches a page with or without a trailing slash, and only that page", () => {
    expect(isOnPage("/raven/view", "raven", "view")).toBe(true);
    expect(isOnPage("/raven/view/", "raven", "view")).toBe(true);
    expect(isOnPage("/raven/view/map", "raven", "view/map")).toBe(true);
    expect(isOnPage("/raven/view/map", "raven", "view")).toBe(false);
    expect(isOnPage("/raven/log", "raven", "view")).toBe(false);
  });
});

describe("readTourRequest", () => {
  it("reads the step and returnTo on an owner page", () => {
    expect(readTourRequest(loc("/beginnerdemo/log", "?tour=3&returnTo=%2Fraven%2Faccount"), 5)).toEqual({
      user: "beginnerdemo",
      step: 2,
      returnTo: "/raven/account",
    });
  });

  it("reads the user from the combined map too", () => {
    expect(readTourRequest(loc("/Raven/view/map", "?tour=5"), 5)).toEqual({ user: "raven", step: 4, returnTo: null });
  });

  it("is null without a tour parameter, and on pages that aren't a logbook's", () => {
    expect(readTourRequest(loc("/beginnerdemo/log", ""), 5)).toBeNull();
    expect(readTourRequest(loc("/help/install/", "?tour=1"), 5)).toBeNull();
    expect(readTourRequest(loc("/raven/sync", "?tour=1&returnTo=%2Fraven%2Flog"), 5)).toBeNull();
    expect(readTourRequest(loc("/raven/account", "?tour=1"), 5)).toBeNull();
    expect(readTourRequest(loc("/raven", "?tour=4"), 5)).toBeNull();
  });

  it("clamps a step outside the tour, and falls back to the first for rubbish", () => {
    expect(readTourRequest(loc("/beginnerdemo/log", "?tour=99"), 5).step).toBe(4);
    expect(readTourRequest(loc("/beginnerdemo/log", "?tour=0"), 5).step).toBe(0);
    expect(readTourRequest(loc("/beginnerdemo/log", "?tour=abc"), 5).step).toBe(0);
  });

  it("ignores a returnTo that leaves the site", () => {
    expect(
      readTourRequest(loc("/beginnerdemo/log", "?tour=1&returnTo=https%3A%2F%2Fevil.example"), 5).returnTo,
    ).toBeNull();
    expect(readTourRequest(loc("/beginnerdemo/log", "?tour=1&returnTo=%2F%2Fevil.example"), 5).returnTo).toBeNull();
  });
});

describe("TOUR_STEPS", () => {
  it("each is on an owner page, with a target, a title and a body", () => {
    for (const step of TOUR_STEPS) {
      expect(["log", "view", "view/map", "performance"]).toContain(step.page);
      expect(step.target).toBeTruthy();
      expect(step.title).toBeTruthy();
      expect(step.body).toBeTruthy();
    }
  });
});

describe("carrying the tour through /sync", () => {
  it("carries the step and where to return to, and restores them on the page it lands on", () => {
    const carried = carryTourParams("?tour=1&returnTo=%2Fraven%2Faccount");
    expect(carried).toBe("&tour=1&tourReturnTo=%2Fraven%2Faccount");
    const params = new URLSearchParams(`returnTo=%2Fraven%2Flog${carried}`);
    expect(restoreTourParams(params, "https://my.climbinglogbook.com")).toBe("?tour=1&returnTo=%2Fraven%2Faccount");
  });

  it("carries nothing without a tour, or with a rubbish step", () => {
    expect(carryTourParams("")).toBe("");
    expect(carryTourParams("?tour=abc")).toBe("");
    expect(restoreTourParams(new URLSearchParams("tour=%3Cscript%3E"), "https://my.climbinglogbook.com")).toBe("");
  });

  it("drops a return path that leaves the site", () => {
    const params = new URLSearchParams("tour=2&tourReturnTo=https%3A%2F%2Fevil.example");
    expect(restoreTourParams(params, "https://my.climbinglogbook.com")).toBe("?tour=2");
  });
});
