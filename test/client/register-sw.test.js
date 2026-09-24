// #947 -- client/register-sw.js.
import { describe, expect, it, vi } from "vitest";
import { registerServiceWorker, unregisterRetiredWorkers } from "../../client/register-sw.js";

const registration = scope => ({ scope, unregister: vi.fn().mockResolvedValue(true) });

function fakeWindow(pathname, container) {
  return {
    location: { pathname },
    navigator: { serviceWorker: container },
    document: { readyState: "complete" },
    requestIdleCallback: cb => cb(),
    setTimeout: cb => cb(),
    addEventListener: () => {},
  };
}

describe("unregisterRetiredWorkers", () => {
  it("removes only the retired /logbook/-scoped registration", async () => {
    const old = registration("https://my.climbinglogbook.com/logbook/");
    const current = registration("https://my.climbinglogbook.com/");
    await unregisterRetiredWorkers({ getRegistrations: async () => [old, current] });
    expect(old.unregister).toHaveBeenCalled();
    expect(current.unregister).not.toHaveBeenCalled();
  });
});

describe("registerServiceWorker", () => {
  it("registers /sw.js with scope / on an owner page, after removing the retired worker", async () => {
    const old = registration("https://my.climbinglogbook.com/logbook/");
    const container = { getRegistrations: vi.fn().mockResolvedValue([old]), register: vi.fn().mockResolvedValue({}) };
    await registerServiceWorker(fakeWindow("/raven/log", container));
    expect(old.unregister).toHaveBeenCalled();
    expect(container.register).toHaveBeenCalledWith("/sw.js", { scope: "/" });
  });

  it.each(["/raven", "/help/", "/login/", "/e2e-fixtures/pages/log.html"])("never registers on %s (not an owner page)", async (path) => {
    const container = { getRegistrations: vi.fn(), register: vi.fn() };
    await registerServiceWorker(fakeWindow(path, container));
    expect(container.register).not.toHaveBeenCalled();
  });

  it("does nothing, and doesn't throw, without service worker support or when registration fails", async () => {
    await expect(registerServiceWorker(fakeWindow("/raven/log", undefined))).resolves.toBeUndefined();
    const failing = { getRegistrations: vi.fn().mockResolvedValue([]), register: vi.fn().mockRejectedValue(new Error("blocked")) };
    await expect(registerServiceWorker(fakeWindow("/raven/log", failing))).resolves.toBeUndefined();
  });
});
