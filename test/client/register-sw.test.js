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
  it("registers /service-worker.js with scope / on an owner page, after removing the retired worker", async () => {
    const old = registration("https://my.climbinglogbook.com/logbook/");
    const active = { postMessage: vi.fn() };
    const container = { getRegistrations: vi.fn().mockResolvedValue([old]), register: vi.fn().mockResolvedValue({}), ready: Promise.resolve({ active }) };
    await registerServiceWorker({ win: fakeWindow("/raven/log", container) });
    expect(old.unregister).toHaveBeenCalled();
    expect(container.register).toHaveBeenCalledWith("/service-worker.js", { scope: "/" });
    expect(active.postMessage).toHaveBeenCalledWith({ type: "precache" });
  });

  it.each(["/raven", "/help/", "/login/", "/e2e-fixtures/pages/log.html", "/beginnerdemo/log"])("never registers on %s (not a signed-in owner's page)", async (path) => {
    const container = { getRegistrations: vi.fn(), register: vi.fn() };
    await registerServiceWorker({ win: fakeWindow(path, container) });
    expect(container.register).not.toHaveBeenCalled();
  });

  it("waits for the page's boot to settle before registering, even if boot fails", async () => {
    let finishBoot;
    const after = new Promise((resolve, reject) => { finishBoot = reject; });
    const container = { getRegistrations: vi.fn().mockResolvedValue([]), register: vi.fn().mockResolvedValue({}), ready: Promise.resolve({ active: null }) };
    const done = registerServiceWorker({ after, win: fakeWindow("/raven/log", container) });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(container.register).not.toHaveBeenCalled();
    finishBoot(new Error("offline"));
    await done;
    expect(container.register).toHaveBeenCalledWith("/service-worker.js", { scope: "/" });
  });

  it("never registers from a page that's navigating away (its destination will)", async () => {
    const container = { getRegistrations: vi.fn().mockResolvedValue([]), register: vi.fn() };
    await registerServiceWorker({ win: fakeWindow("/raven/log", container), isLeaving: () => true });
    expect(container.register).not.toHaveBeenCalled();
  });

  it("does nothing, and doesn't throw, without service worker support or when registration fails", async () => {
    await expect(registerServiceWorker({ win: fakeWindow("/raven/log", undefined) })).resolves.toBeUndefined();
    const failing = { getRegistrations: vi.fn().mockResolvedValue([]), register: vi.fn().mockRejectedValue(new Error("blocked")) };
    await expect(registerServiceWorker({ win: fakeWindow("/raven/log", failing) })).resolves.toBeUndefined();
  });
});
