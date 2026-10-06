import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { createAuth } from "../server/lib/auth.js";

describe("createAuth (#1253)", () => {
  it("builds a fresh instance for every call, so nothing one request creates is reused by another", () => {
    const first = createAuth(env, "test-fresh.example");
    const second = createAuth(env, "test-fresh.example");
    expect(second).not.toBe(first);
  });
});
