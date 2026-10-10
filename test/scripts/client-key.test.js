import { describe, expect, it } from "vitest";
import { clientKey } from "../../server/lib/rate-limits.js";

const from = ip => new Request("https://x/", { headers: ip ? { "cf-connecting-ip": ip } : {} });

describe("clientKey (#1049)", () => {
  it("keys IPv4 by the address", () => {
    expect(clientKey(from("203.0.113.7"))).toBe("203.0.113.7");
  });

  it("keys IPv6 by its /64, however the address is written", () => {
    const key = "2001:0db8:0001:0002::/64";
    expect(clientKey(from("2001:db8:1:2::1"))).toBe(key);
    expect(clientKey(from("2001:DB8:1:2:ffff:ffff:ffff:ffff"))).toBe(key);
    expect(clientKey(from("2001:0db8:0001:0002:0:0:0:9"))).toBe(key);
    expect(clientKey(from("::1"))).toBe("0000:0000:0000:0000::/64");
  });

  it("keys an IPv4-mapped address as the IPv4 address", () => {
    expect(clientKey(from("::ffff:203.0.113.7"))).toBe("203.0.113.7");
  });

  it("doesn't throw on a malformed address", () => {
    expect(() => clientKey(from("1:2:3:4:5:6:7:8:9"))).not.toThrow();
    expect(() => clientKey(from("1::2::3"))).not.toThrow();
  });

  it("puts a request with no client IP in one shared bucket", () => {
    expect(clientKey(from(null))).toBe("unknown");
  });
});
