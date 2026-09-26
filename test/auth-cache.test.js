import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { createAuth } from "../server/lib/auth.js";

describe("createAuth caching (#782)", () => {
  it("returns the same instance for repeated calls with the same hostname", () => {
    const first = createAuth(env, "test-cache-same.example");
    const second = createAuth(env, "test-cache-same.example");
    expect(second).toBe(first);
  });

  it("returns a distinct instance for a different hostname", () => {
    const a = createAuth(env, "test-cache-a.example");
    const b = createAuth(env, "test-cache-b.example");
    expect(b).not.toBe(a);
  });
});
