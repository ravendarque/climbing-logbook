import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchJson } from "./support.js";

afterEach(() => vi.restoreAllMocks());

function violations() {
  const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
  return () => spy.mock.calls.map(([line]) => JSON.parse(line)).filter(line => line.event === "csp.violation");
}

const post = (body, type) =>
  fetchJson("/-/csp-report", { method: "POST", headers: { "Content-Type": type }, body: JSON.stringify(body) });

describe("CSP violation reports (#1042)", () => {
  it("logs the directive and the blocked origin from a legacy report, never the full URL", async () => {
    const lines = violations();
    const res = await post(
      {
        "csp-report": {
          "document-uri": "https://my.climbinglogbook.com/raven/log",
          "effective-directive": "script-src-elem",
          "blocked-uri": "https://evil.example/steal.js?u=raven",
        },
      },
      "application/csp-report",
    );
    expect(res.status).toBe(204);
    expect(lines()).toEqual([
      expect.objectContaining({
        event: "csp.violation",
        directive: "script-src-elem",
        blocked: "https://evil.example",
      }),
    ]);
    expect(JSON.stringify(lines())).not.toMatch(/raven|steal/);
  });

  it("reads the Reporting API's array format, and ignores other report types", async () => {
    const lines = violations();
    await post(
      [
        { type: "csp-violation", body: { effectiveDirective: "img-src", blockedURL: "https://tracker.example/p.gif" } },
        { type: "deprecation", body: { id: "x" } },
      ],
      "application/reports+json",
    );
    expect(lines()).toEqual([expect.objectContaining({ directive: "img-src", blocked: "https://tracker.example" })]);
  });

  it("refuses bodies that aren't JSON or are too large", async () => {
    violations();
    expect((await fetchJson("/-/csp-report", { method: "POST", body: "not json" })).status).toBe(400);
    expect((await fetchJson("/-/csp-report", { method: "POST", body: "x".repeat(20_000) })).status).toBe(413);
  });
});
