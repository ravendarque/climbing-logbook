// #985 -- app pages point their apex links (data-apex-link) at the apex on
// the production app hosts, and leave them alone everywhere else.
import { describe, expect, it } from "vitest";
import { pointApexLinksAtApex } from "../../client/apex-links.js";

function page() {
  document.body.innerHTML = `
    <a id="help" data-apex-link href="/help/">Help</a>
    <a id="grades" data-apex-link href="https://climbinglogbook.com/help/grade-scales/">Grades</a>
    <a id="placeholder" data-apex-link href="#">Soon</a>
    <a id="app" href="/ravendarque/log">Log</a>`;
  return id => document.getElementById(id).getAttribute("href");
}

describe("pointApexLinksAtApex", () => {
  it.each(["my.climbinglogbook.com", "beta.climbinglogbook.com"])("points marked links at the apex on %s", hostname => {
    const href = page();
    pointApexLinksAtApex(document, hostname);
    expect(href("help")).toBe("https://climbinglogbook.com/help/");
    expect(href("app")).toBe("/ravendarque/log");
  });

  it("leaves absolute and placeholder hrefs alone, so running twice changes nothing", () => {
    const href = page();
    pointApexLinksAtApex(document, "my.climbinglogbook.com");
    pointApexLinksAtApex(document, "my.climbinglogbook.com");
    expect(href("help")).toBe("https://climbinglogbook.com/help/");
    expect(href("grades")).toBe("https://climbinglogbook.com/help/grade-scales/");
    expect(href("placeholder")).toBe("#");
  });

  it.each(["climbinglogbook.com", "my.localhost", "pr-1-climbing-logbook-preview.ravendarque.workers.dev"])("changes nothing on %s", hostname => {
    const href = page();
    pointApexLinksAtApex(document, hostname);
    expect(href("help")).toBe("/help/");
  });
});
