import { describe, expect, it } from "vitest";
import { insightsHtml } from "../../client/insight-card.js";

describe("insightsHtml (#1375)", () => {
  it("stacks one card per insight, in order, each carrying its tone", () => {
    const html = insightsHtml([
      { tone: "negative", text: "First", detail: "Why" },
      { tone: "positive", text: "Second" },
      { tone: "neutral", text: "Third" },
    ]);
    expect([...html.matchAll(/data-insight-tone="(\w+)"/g)].map(m => m[1])).toEqual([
      "negative",
      "positive",
      "neutral",
    ]);
    expect(html.indexOf("First")).toBeLessThan(html.indexOf("Second"));
    expect(html).toContain("Why");
  });

  it("escapes the text and treats an unknown tone as neutral", () => {
    const html = insightsHtml([{ tone: "loud", text: "<b>x</b>" }]);
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(html).toContain('data-insight-tone="neutral"');
  });

  it("sets a haiku as the poem alone, line by line", () => {
    const html = insightsHtml([{ tone: "positive", text: "One\nTwo & three", haiku: true, title: "Ignored" }]);
    expect(html).toContain('<p class="haiku">One<br>Two &amp; three</p>');
    expect(html).not.toContain("Ignored");
  });

  it("puts a card's title above its message (#1389)", () => {
    const html = insightsHtml([{ tone: "neutral", title: "Not enough data yet", text: "Log more." }]);
    expect(html).toMatch(/data-insight-title>Not enough data yet<\/p>[\s\S]*Log more\./);
  });

  it("adds a link under the message when one is given, escaped (#1405)", () => {
    const html = insightsHtml([
      { tone: "neutral", title: "Off", text: "Why.", link: { href: '/a"b/account', label: "Turn <it> on" } },
    ]);
    expect(html).toContain('<a class="text-accent-ink underline" href="/a&quot;b/account">Turn &lt;it&gt; on</a>');
    expect(insightsHtml([{ tone: "neutral", title: "Off", text: "Why." }])).not.toContain("<a ");
  });

  it("renders nothing when there are no insights", () => {
    expect(insightsHtml([])).toBe("");
    expect(insightsHtml([null])).toBe("");
  });
});
