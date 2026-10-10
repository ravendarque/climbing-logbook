import { env, exports } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CSP_HEADER } from "../server/lib/csp.js";
import { DEMO_USERNAMES } from "../shared/demo-personas.js";

afterEach(() => vi.restoreAllMocks());

const nonceOf = res => res.headers.get(CSP_HEADER)?.match(/'nonce-([^']+)'/)?.[1];

describe("the Worker-sent CSP (#1042)", () => {
  it("is on HTML pages, with a fresh nonce every time", async () => {
    const url = `https://my.example.com/${DEMO_USERNAMES[0]}/log`;
    const first = await exports.default.fetch(url);
    const second = await exports.default.fetch(url);
    expect(first.headers.get("Content-Type")).toContain("text/html");
    expect(nonceOf(first)).toMatch(/^[0-9a-f-]{36}$/);
    expect(nonceOf(second)).not.toBe(nonceOf(first));
    expect(first.headers.get(CSP_HEADER)).toContain("frame-ancestors 'none'");
  });

  it("is on the error page", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await exports.default.fetch("https://example.com/-/test/throw");
    expect(res.status).toBe(500);
    expect(nonceOf(res)).toBeTruthy();
  });

  it("isn't on JSON", async () => {
    const res = await exports.default.fetch("https://example.com/-/api/health");
    expect(res.headers.get(CSP_HEADER)).toBeNull();
  });

  it("sends the static pages through the Worker, but not their scripts or help search's files", () => {
    const paths = env.RUN_WORKER_FIRST_PATHS;
    for (const path of ["/help/*", "/login/", "/register/", "/reset-password/", "/-/launch/*", "!/help/pagefind/*"]) {
      expect(paths).toContain(path);
    }
    expect(paths).not.toContain("/login/*");
  });

  it("serves static pages on the my. host too, rather than reading them as usernames", async () => {
    for (const path of ["/help/", "/login/"]) {
      const res = await exports.default.fetch(`https://my.example.com${path}`);
      expect(res.status, path).toBe(200);
      expect(nonceOf(res), path).toBeTruthy();
    }
  });
});
