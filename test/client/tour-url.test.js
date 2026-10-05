import { describe, expect, it } from "vitest";
import { resolveStep, TOUR_STEPS } from "../../client/tour/steps.js";
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

  it("sends the profile, which only exists on my., to my.", () => {
    expect(tourUrl({ user: "raven", page: "profile", step: 3, hostname: "my.climbinglogbook.com" })).toBe(
      "/raven?tour=4",
    );
    expect(tourUrl({ user: "raven", page: "profile", step: 3, hostname: "beta.climbinglogbook.com" })).toBe(
      "https://my.climbinglogbook.com/raven?tour=4",
    );
    expect(tourUrl({ user: "raven", page: "log", step: 0, hostname: "beta.climbinglogbook.com" })).toBe(
      "/raven/log?tour=1",
    );
  });

  it("starts on the first step's page, on the given account", () => {
    expect(tourStartUrl("raven", "/raven/account")).toBe("/raven/log?tour=1&returnTo=%2Fraven%2Faccount");
    expect(resolveStep(TOUR_STEPS[0], true).page).toBe(TOUR_FIRST_PAGE);
  });
});

describe("isOnPage", () => {
  it("matches the profile at /:user with or without a trailing slash, and other pages by name", () => {
    expect(isOnPage("/raven", "raven", "profile")).toBe(true);
    expect(isOnPage("/raven/", "raven", "profile")).toBe(true);
    expect(isOnPage("/raven/log", "raven", "profile")).toBe(false);
    expect(isOnPage("/raven/map", "raven", "map")).toBe(true);
    expect(isOnPage("/raven/map", "raven", "log")).toBe(false);
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

  it("reads the user from a profile page too", () => {
    expect(readTourRequest(loc("/Raven", "?tour=4"), 5)).toEqual({ user: "raven", step: 3, returnTo: null });
  });

  it("is null without a tour parameter, and on pages that aren't a logbook's", () => {
    expect(readTourRequest(loc("/beginnerdemo/log", ""), 5)).toBeNull();
    expect(readTourRequest(loc("/help/install/", "?tour=1"), 5)).toBeNull();
    expect(readTourRequest(loc("/raven/sync", "?tour=1&returnTo=%2Fraven%2Flog"), 5)).toBeNull();
    expect(readTourRequest(loc("/raven/account", "?tour=1"), 5)).toBeNull();
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
  it("each has a page, a title and a body, and a target unless it's a card on its own", () => {
    for (const step of TOUR_STEPS) {
      expect(["log", "map", "performance", "profile"]).toContain(step.page);
      expect(step.title).toBeTruthy();
      expect(step.body).toBeTruthy();
      expect(step.target === undefined ? false : step.target !== "").toBe(true);
    }
  });

  it("a private logbook's steps never land on the profile page", () => {
    for (const step of TOUR_STEPS) expect(resolveStep(step, false).page).not.toBe("profile");
    expect(resolveStep(TOUR_STEPS[3], false).target).toBeNull();
    expect(resolveStep(TOUR_STEPS[4], false).state).toBeNull();
  });

  it("a public logbook's steps are used as written", () => {
    for (const step of TOUR_STEPS) expect(resolveStep(step, true)).toBe(step);
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
