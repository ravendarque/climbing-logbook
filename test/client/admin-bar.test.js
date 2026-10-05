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
    const tabBar = { markReady };
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
    const tabBar = { markReady };
    const headerChrome = { updateMenuDivider: vi.fn() };
    const store = { isLoggedIn: () => false };
    syncAdminBar({ store, adminAuth: makeAdminAuth(), headerChrome, tabBar });
    syncAdminBar({ store, adminAuth: makeAdminAuth(), headerChrome, tabBar });
    expect(markReady).toHaveBeenCalledTimes(2);
  });

  it("shows the page's Performance tab only for a signed-in owner in Athlete Mode", () => {
    document.body.insertAdjacentHTML("beforeend", '<a id="performance-tab" hidden></a>');
    const headerChrome = { updateMenuDivider: vi.fn() };
    const tab = document.getElementById("performance-tab");

    syncAdminBar({
      store: { isLoggedIn: () => true },
      adminAuth: makeAdminAuth({ isAthleteMode: () => true }),
      headerChrome,
    });
    expect(tab.hidden).toBe(false);

    syncAdminBar({ store: { isLoggedIn: () => true }, adminAuth: makeAdminAuth(), headerChrome });
    expect(tab.hidden).toBe(true);

    syncAdminBar({
      store: { isLoggedIn: () => false },
      adminAuth: makeAdminAuth({ isAthleteMode: () => true }),
      headerChrome,
    });
    expect(tab.hidden).toBe(true);
  });
});
