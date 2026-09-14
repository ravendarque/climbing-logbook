// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { syncAdminBar } from "../../client/admin-bar.js";

function makeAdminAuth(overrides = {}) {
  return { getUsername: () => null, isAthleteMode: () => false, ...overrides };
}

beforeEach(() => {
  document.body.innerHTML = `
    <button id="login-toggle-btn"></button>
    <div id="menu-username"></div>
    <a id="my-account-link"></a>
  `;
});

describe("syncAdminBar", () => {
  it("calls tabBar.markReady() when a tabBar is present", () => {
    const markReady = vi.fn();
    const tabBar = { toggleAttribute: vi.fn(), markReady };
    const headerChrome = { updateMenuDivider: vi.fn() };
    const store = { isLoggedIn: () => false };
    syncAdminBar({ store, adminAuth: makeAdminAuth(), headerChrome, tabBar });
    expect(markReady).toHaveBeenCalledTimes(1);
  });

  it("does not throw when there is no tabBar on this page", () => {
    const headerChrome = { updateMenuDivider: vi.fn() };
    const store = { isLoggedIn: () => false };
    expect(() => syncAdminBar({ store, adminAuth: makeAdminAuth(), headerChrome, tabBar: undefined })).not.toThrow();
  });

  it("calls markReady() on every invocation, not just the first (component itself is idempotent)", () => {
    const markReady = vi.fn();
    const tabBar = { toggleAttribute: vi.fn(), markReady };
    const headerChrome = { updateMenuDivider: vi.fn() };
    const store = { isLoggedIn: () => false };
    syncAdminBar({ store, adminAuth: makeAdminAuth(), headerChrome, tabBar });
    syncAdminBar({ store, adminAuth: makeAdminAuth(), headerChrome, tabBar });
    expect(markReady).toHaveBeenCalledTimes(2);
  });
});
