import { describe, expect, it } from "vitest";
import { deviceName } from "../../client/device-name.js";

const UA = {
  firefoxAndroid: "Mozilla/5.0 (Android 15; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0",
  safariIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Mobile/15E148 Safari/604.1",
  safariMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Safari/605.1.15",
  chromeWindows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  edgeWindows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0",
  firefoxIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/141.0 Mobile/15E148 Safari/605.1.15",
  firefoxLinux: "Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0",
  chromeChromebook:
    "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
};

describe("deviceName (#1467)", () => {
  it.each([
    [UA.firefoxAndroid, "Firefox on Android"],
    [UA.safariIphone, "Safari on iPhone"],
    [UA.safariMac, "Safari on Mac"],
    [UA.chromeWindows, "Chrome on Windows"],
    [UA.edgeWindows, "Edge on Windows"],
    [UA.firefoxIphone, "Firefox on iPhone"],
    [UA.firefoxLinux, "Firefox on Linux"],
    [UA.chromeChromebook, "Chrome on ChromeOS"],
  ])("names %s as %s", (userAgent, name) => {
    expect(deviceName({ userAgent })).toBe(name);
  });

  it("tells an iPad asking for the desktop site from a Mac by its touch screen", () => {
    expect(deviceName({ userAgent: UA.safariMac, maxTouchPoints: 5 })).toBe("Safari on iPad");
  });

  it("names Brave, whose user agent reads as Chrome", () => {
    expect(deviceName({ userAgent: UA.chromeWindows, brave: true })).toBe("Brave on Windows");
  });

  it("gives what it can, and nothing for a user agent it doesn't know", () => {
    expect(deviceName({ userAgent: "Mozilla/5.0 (Windows NT 10.0) Gecko" })).toBe("Windows");
    expect(deviceName({ userAgent: "curl/8.0" })).toBe("");
  });
});
