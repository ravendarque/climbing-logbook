// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import "../../client/components/climbing-tab-bar.js";

function mount({ activePage = "log", username = "raven", links }) {
  const el = document.createElement("climbing-tab-bar");
  el.setAttribute("active-page", activePage);
  el.setAttribute("username", username);
  el.innerHTML = `<nav class="tab-nav">${links}</nav>`;
  document.body.append(el);
  return el;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("ClimbingTabBar", () => {
  it("points each supplied link at that page of the user's logbook", () => {
    const el = mount({ links: '<a data-page="log">Logbook</a><a data-page="map">Map</a>' });
    expect([...el.querySelectorAll("a")].map(a => a.getAttribute("href"))).toEqual(["/raven/log", "/raven/map"]);
  });

  it("marks the active page's link, and only that one", () => {
    const el = mount({ activePage: "map", links: '<a data-page="log">Logbook</a><a data-page="map">Map</a>' });
    const [log, map] = el.querySelectorAll("a");
    expect(log.hasAttribute("aria-current")).toBe(false);
    expect(map.getAttribute("aria-current")).toBe("page");
  });

  it("encodes the username", () => {
    const el = mount({ username: "a b", links: '<a data-page="log">Logbook</a>' });
    expect(el.querySelector("a").getAttribute("href")).toBe("/a%20b/log");
  });

  it("follows a username set after it connects", () => {
    const el = mount({ username: "", links: '<a data-page="log">Logbook</a>' });
    el.setAttribute("username", "raven");
    expect(el.querySelector("a").getAttribute("href")).toBe("/raven/log");
  });

  it("leaves whether a link shows to the page", () => {
    const el = mount({ links: '<a data-page="log">Logbook</a><a data-page="performance" hidden>Performance</a>' });
    el.markReady();
    expect(el.querySelector('[data-page="performance"]').hidden).toBe(true);
  });

  it("is marked ready only when the page says so, and stays ready", () => {
    const el = mount({ links: '<a data-page="log">Logbook</a>' });
    expect(el.hasAttribute("ready")).toBe(false);
    el.markReady();
    el.markReady();
    expect(el.hasAttribute("ready")).toBe(true);
  });
});
