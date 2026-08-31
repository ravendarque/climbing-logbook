import { describe, expect, it } from "vitest";
import { evidenceOverlayHtml, evidenceTierButtonHtml } from "../../client/evidence-tier.js";

describe("evidenceOverlayHtml", () => {
  it("renders the dialog shell with the required id and ARIA attributes", () => {
    const html = evidenceOverlayHtml(["community"]);
    expect(html).toContain('id="evidence-overlay"');
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('id="evidence-close"');
  });

  it("renders only the requested tiers, not every tier", () => {
    const html = evidenceOverlayHtml(["community"]);
    expect(html).toContain("Community data");
    expect(html).not.toContain("Peer-reviewed");
    expect(html).not.toContain("Coaching heuristic");
  });

  it("renders multiple requested tiers", () => {
    const html = evidenceOverlayHtml(["peer", "community"]);
    expect(html).toContain("Peer-reviewed");
    expect(html).toContain("Community data");
    expect(html).not.toContain("Coaching heuristic");
  });

  it("renders an empty tier list without throwing", () => {
    expect(() => evidenceOverlayHtml([])).not.toThrow();
  });

  it("throws on an unrecognized tier key rather than silently omitting it", () => {
    expect(() => evidenceOverlayHtml(["not-a-real-tier"])).toThrow();
  });
});

describe("evidenceTierButtonHtml", () => {
  it("renders the given text as the button's own label", () => {
    const html = evidenceTierButtonHtml("community data", "community");
    expect(html).toContain(">community data<");
  });

  it("marks the button with data-evidence-tier for click-delegation wiring", () => {
    const html = evidenceTierButtonHtml("community data", "community");
    expect(html).toContain("data-evidence-tier");
  });

  it("escapes HTML-significant characters in the button text", () => {
    const html = evidenceTierButtonHtml("<script>", "community");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
