import { env } from "cloudflare:workers";
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

  it("logs at most three violations from one report", async () => {
    const lines = violations();
    const many = Array.from({ length: 8 }, () => ({
      type: "csp-violation",
      body: { effectiveDirective: "img-src", blockedURL: "https://x.example/a" },
    }));
    await post(many, "application/reports+json");
    expect(lines()).toHaveLength(3);
  });

  it("turns away an IP that sends more than ten reports a minute", async () => {
    violations();
    env.RATE_LIMITING_ENABLED = "true";
    try {
      const statuses = [];
      for (let i = 0; i < 11; i++) {
        const res = await fetchJson("/-/csp-report", {
          method: "POST",
          headers: { "Content-Type": "application/csp-report", "cf-connecting-ip": "198.51.100.42" },
          body: JSON.stringify({ "csp-report": { "effective-directive": "img-src", "blocked-uri": "data" } }),
        });
        statuses.push(res.status);
      }
      expect(statuses.slice(0, 10).every(status => status === 204)).toBe(true);
      expect(statuses[10]).toBe(429);
    } finally {
      env.RATE_LIMITING_ENABLED = "false";
    }
  });

  it("refuses bodies that aren't JSON or are too large", async () => {
    violations();
    expect((await fetchJson("/-/csp-report", { method: "POST", body: "not json" })).status).toBe(400);
    expect((await fetchJson("/-/csp-report", { method: "POST", body: "x".repeat(20_000) })).status).toBe(413);
  });
});
