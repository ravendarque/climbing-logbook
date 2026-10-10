import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { DEMO_USERNAMES } from "../shared/demo-personas.js";

const nonceOf = res => res.headers.get("Content-Security-Policy")?.match(/'nonce-([^']+)'/)?.[1];

describe("the Worker-sent CSP on the demo logbooks (#1042)", () => {
  it("carries a fresh nonce on every response", async () => {
    const url = `https://my.example.com/${DEMO_USERNAMES[0]}/log`;
    const first = await exports.default.fetch(url);
    const second = await exports.default.fetch(url);
    expect(nonceOf(first)).toMatch(/^[0-9a-f-]{36}$/);
    expect(nonceOf(second)).not.toBe(nonceOf(first));
    expect(first.headers.get("Content-Security-Policy")).toContain("frame-ancestors 'none'");
  });

  it("leaves other owner pages to the edge rule", async () => {
    const res = await exports.default.fetch("https://my.example.com/someone/log");
    expect(res.headers.get("Content-Security-Policy")).toBeNull();
  });
});
