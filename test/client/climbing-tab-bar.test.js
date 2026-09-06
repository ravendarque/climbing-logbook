// @vitest-environment happy-dom
//
// #605 -- covers the render-gating fix (this file had no dedicated unit
// test before). happy-dom, same reasoning test/client/move-tagging.test.js
// gives: this component renders real DOM and needs a document, which the
// Cloudflare Workers pool (vitest.config.js's default) doesn't have.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import "../../client/components/climbing-tab-bar.js";

let el;

beforeEach(() => {
  el = document.createElement("climbing-tab-bar");
});

afterEach(() => {
  el.remove();
});

describe("ClimbingTabBar", () => {
  it("does not render on connect -- stays empty until markReady()", () => {
    el.setAttribute("active-page", "log");
    document.body.append(el);
    expect(el.innerHTML).toBe("");
  });

  it("does not render on an attribute change before markReady()", () => {
    document.body.append(el);
    el.setAttribute("username", "raven");
    el.setAttribute("active-page", "log");
    el.toggleAttribute("show-performance", true);
    expect(el.innerHTML).toBe("");
  });

  it("markReady() renders exactly once, reflecting whatever attributes are already set", () => {
    el.setAttribute("username", "raven");
    el.setAttribute("active-page", "log");
    document.body.append(el);
    el.markReady();
    const links = el.querySelectorAll("a");
    expect(links).toHaveLength(1); // Logbook only -- show-performance never set
    expect(links[0].getAttribute("href")).toBe("/raven/log");
    expect(links[0].getAttribute("aria-current")).toBe("page");
  });

  it("markReady() is idempotent -- a second call doesn't re-render", () => {
    el.setAttribute("username", "raven");
    el.setAttribute("active-page", "log");
    document.body.append(el);
    el.markReady();
    const firstHtml = el.innerHTML;
    expect(() => el.markReady()).not.toThrow();
    expect(el.innerHTML).toBe(firstHtml);
  });

  it("still reacts normally to attribute changes once ready (e.g. show-performance flips true later)", () => {
    el.setAttribute("username", "raven");
    el.setAttribute("active-page", "performance");
    document.body.append(el);
    el.markReady();
    expect(el.querySelectorAll("a")).toHaveLength(1);

    el.toggleAttribute("show-performance", true);
    const links = el.querySelectorAll("a");
    expect(links).toHaveLength(2);
    expect(links[1].textContent).toBe("Performance");
    expect(links[1].getAttribute("aria-current")).toBe("page");
  });
});
