import { describe, expect, it } from "vitest";
import { tourSteps } from "../../client/tour/steps.js";
import {
  firstDemoVisitTourUrl,
  isOnPage,
  readTourRequest,
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

  it("starts on the first step's page, on the demo account", () => {
    expect(tourStartUrl("/raven/account")).toBe("/intermediatedemo/log?tour=1&returnTo=%2Fraven%2Faccount");
    expect(tourSteps()[0].page).toBe(TOUR_FIRST_PAGE);
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
    expect(readTourRequest(loc("/IntermediateDemo/view/map", "?tour=5"), 5)).toEqual({
      user: "intermediatedemo",
      step: 4,
      returnTo: null,
    });
  });

  it("only runs on a demo account", () => {
    expect(readTourRequest(loc("/raven/log", "?tour=1"), 5)).toBeNull();
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

describe("tourSteps", () => {
  it("is the same eleven steps for everyone", () => {
    expect(tourSteps().map(step => step.title)).toEqual([
      "Discipline",
      "Log a climb",
      "Where you climbed",
      "How did it go?",
      "Working offline",
      "Find a climb",
      "Your combined logbook",
      "Your map",
      "Performance Insights",
      "Log more detail",
      "Your reports",
    ]);
  });

  it("names the gap report for the discipline", () => {
    const reports = discipline => tourSteps({ discipline }).find(step => step.title === "Your reports").body;
    expect(reports("boulder")).toContain("Send / Flash Gap");
    expect(reports("sport")).toContain("Redpoint / Onsight Gap");
  });

  it("each step is on a tour page, with a target, a title and a body", () => {
    for (const step of tourSteps()) {
      expect(["log", "view", "view/map", "performance"]).toContain(step.page);
      expect(step.target).toBeTruthy();
      expect(step.title).toBeTruthy();
      expect(typeof step.body).toBe("string");
    }
  });
});

describe("firstDemoVisitTourUrl", () => {
  const storage = () => {
    const items = new Map();
    return { getItem: k => items.get(k) ?? null, setItem: (k, v) => items.set(k, v) };
  };

  it("starts the tour on a visitor's first demo page, and only the first", () => {
    const seen = storage();
    expect(firstDemoVisitTourUrl(loc("/beginnerdemo/view", ""), seen)).toBe(
      "/beginnerdemo/log?tour=1&returnTo=%2Fbeginnerdemo%2Fview",
    );
    expect(firstDemoVisitTourUrl(loc("/advanceddemo/log", ""), seen)).toBeNull();
  });

  it("leaves your own logbook, other pages and a tour already running alone", () => {
    const seen = storage();
    expect(firstDemoVisitTourUrl(loc("/raven/log", ""), seen)).toBeNull();
    expect(firstDemoVisitTourUrl(loc("/beginnerdemo", ""), seen)).toBeNull();
    expect(firstDemoVisitTourUrl(loc("/beginnerdemo/log", "?tour=3"), seen)).toBeNull();
    expect(firstDemoVisitTourUrl(loc("/beginnerdemo/log", ""), seen)).not.toBeNull();
  });

  it("doesn't start when the device can't remember it did", () => {
    const blocked = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException("blocked", "SecurityError");
      },
    };
    expect(firstDemoVisitTourUrl(loc("/beginnerdemo/log", ""), blocked)).toBeNull();
  });
});
