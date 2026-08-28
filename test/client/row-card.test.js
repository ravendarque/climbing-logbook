import { describe, expect, it } from "vitest";
import { rowCardHtml } from "../../client/row-card.js";

describe("rowCardHtml", () => {
  it("renders the two-column shape with title, description, and control", () => {
    const html = rowCardHtml({
      id: "test-row",
      title: "Grade Pyramid",
      description: "See your climbs broken down by grade.",
      controlHtml: '<a class="admin-btn shrink-0" href="/alice/performance/pyramid">View</a>',
    });

    expect(html).toContain('id="test-row"');
    expect(html).toContain('class="row-card flex items-center gap-3"');
    expect(html).toContain('<span class="row-card-title">Grade Pyramid</span>');
    expect(html).toContain("See your climbs broken down by grade.");
    expect(html).toContain('<a class="admin-btn shrink-0" href="/alice/performance/pyramid">View</a>');
  });

  it("omits the status line when status is not given", () => {
    const html = rowCardHtml({ id: "r", title: "T", description: "D", controlHtml: "<button>Go</button>" });
    expect(html).not.toContain('text-accent');
  });

  it("includes an accent-colored status line when status is given", () => {
    const html = rowCardHtml({ id: "r", title: "T", description: "D", status: "3 sends logged", controlHtml: "<button>Go</button>" });
    expect(html).toContain('text-[.78rem] text-accent mt-1');
    expect(html).toContain("3 sends logged");
  });

  it("escapes title, description, and status but not controlHtml", () => {
    const html = rowCardHtml({
      id: "r",
      title: '<img src=x onerror=alert(1)>',
      description: "<script>alert(2)</script>",
      status: "<b>bold</b>",
      controlHtml: '<a href="/safe">View</a>',
    });
    expect(html).not.toContain("<img src=x onerror=alert(1)>");
    expect(html).not.toContain("<script>alert(2)</script>");
    expect(html).not.toContain("<b>bold</b>");
    expect(html).toContain('<a href="/safe">View</a>');
  });
});
