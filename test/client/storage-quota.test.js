import { describe, expect, it } from "vitest";
import { isQuotaError, isSafariTab } from "../../client/storage-quota.js";

const SAFARI_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const CHROME_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1";
const CHROME_DESKTOP =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

function win({ standalone = false, displayStandalone = false } = {}) {
  return { navigator: { standalone }, matchMedia: () => ({ matches: displayStandalone }) };
}

describe("isQuotaError", () => {
  it("recognises each browser's quota error", () => {
    expect(isQuotaError(new DOMException("full", "QuotaExceededError"))).toBe(true);
    expect(isQuotaError({ name: "NS_ERROR_DOM_QUOTA_REACHED" })).toBe(true);
    expect(isQuotaError({ code: 22 })).toBe(true);
    expect(isQuotaError(new TypeError("boom"))).toBe(false);
  });
});

describe("isSafariTab", () => {
  it("is true for Safari in a tab", () => {
    expect(isSafariTab(SAFARI_IOS, win())).toBe(true);
  });
  it("is false once installed to the home screen", () => {
    expect(isSafariTab(SAFARI_IOS, win({ standalone: true }))).toBe(false);
    expect(isSafariTab(SAFARI_IOS, win({ displayStandalone: true }))).toBe(false);
  });
  it("is false for other browsers, even on iOS", () => {
    expect(isSafariTab(CHROME_IOS, win())).toBe(false);
    expect(isSafariTab(CHROME_DESKTOP, win())).toBe(false);
  });
});
