// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAdminAuth } from "../../client/admin-auth.js";

function makeStore() {
  let loggedIn = false;
  const entries = [];
  return {
    isLoggedIn: () => loggedIn,
    setLoggedIn: v => { loggedIn = v; },
    getEntries: () => entries,
    setActiveType: vi.fn(),
  };
}

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = `<button id="login-toggle-btn"></button>`;
});

describe("settings cache", () => {
  it("seeds athleteMode/logbookPublic/betaOptIn/persistedDiscipline from a cached value at construction, before any fetch", () => {
    localStorage.setItem("logbook_settings_cache", JSON.stringify({
      athleteMode: true, logbookPublic: false, betaOptIn: true, activeDiscipline: "sport",
    }));
    const adminAuth = createAdminAuth({ store: makeStore(), adminFetch: fetch, isAuthRedirect: () => false, adminSettingsUrl: "/x", updateAdminBar: () => {} });
    expect(adminAuth.isAthleteMode()).toBe(true);
    expect(adminAuth.isLogbookPublic()).toBe(false);
    expect(adminAuth.getBetaOptIn()).toBe(true);
    expect(adminAuth.getPersistedDiscipline()).toBe("sport");
  });

  it("falls back to the documented defaults when nothing is cached", () => {
    const adminAuth = createAdminAuth({ store: makeStore(), adminFetch: fetch, isAuthRedirect: () => false, adminSettingsUrl: "/x", updateAdminBar: () => {} });
    expect(adminAuth.isAthleteMode()).toBe(false);
    expect(adminAuth.isLogbookPublic()).toBe(true);
    expect(adminAuth.getBetaOptIn()).toBe(null);
    expect(adminAuth.getPersistedDiscipline()).toBe(null);
  });

  it("rejects a garbage/invalid-discipline cache entry rather than trusting it", () => {
    localStorage.setItem("logbook_settings_cache", JSON.stringify({ athleteMode: true, activeDiscipline: "not-a-real-type" }));
    const adminAuth = createAdminAuth({ store: makeStore(), adminFetch: fetch, isAuthRedirect: () => false, adminSettingsUrl: "/x", updateAdminBar: () => {} });
    expect(adminAuth.getPersistedDiscipline()).toBe(null);
  });

  it("fetchSettings() writes a fresh cache entry on success", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ athleteMode: true, logbookPublic: false, betaOptIn: false, activeDiscipline: "boulder" }) });
    const adminAuth = createAdminAuth({ store: makeStore(), adminFetch: fetch, isAuthRedirect: () => false, adminSettingsUrl: "/x", updateAdminBar: () => {} });
    await adminAuth.fetchSettings();
    expect(JSON.parse(localStorage.getItem("logbook_settings_cache"))).toEqual({
      athleteMode: true, logbookPublic: false, betaOptIn: false, activeDiscipline: "boulder",
    });
  });

  it("a failed fetchSettings() leaves the cache-seeded values untouched, not a hardcoded default", async () => {
    localStorage.setItem("logbook_settings_cache", JSON.stringify({ athleteMode: true, logbookPublic: true, betaOptIn: null, activeDiscipline: "sport" }));
    global.fetch = vi.fn().mockRejectedValue(new Error("offline"));
    const adminAuth = createAdminAuth({ store: makeStore(), adminFetch: fetch, isAuthRedirect: () => false, adminSettingsUrl: "/x", updateAdminBar: () => {} });
    await adminAuth.fetchSettings();
    expect(adminAuth.isAthleteMode()).toBe(true); // still the cached value, not reset to false
  });
});

// #847 follow-up -- checkSession()/fetchSettings() each put a real
// AbortSignal.timeout() on their own fetch and call the injected
// onFetchTimeout() specifically when THAT is what rejected the promise
// (err.name === "TimeoutError"), not for any other network failure --
// these tests construct that exact rejection shape (a DOMException
// named "TimeoutError", matching what AbortSignal.timeout() itself
// produces) rather than assuming any thrown error should count.
describe("onFetchTimeout", () => {
  it("fetchSettings() calls onFetchTimeout() on a genuine timeout, not on a generic network error", async () => {
    const onFetchTimeout = vi.fn();
    global.fetch = vi.fn().mockRejectedValue(new DOMException("The operation timed out.", "TimeoutError"));
    const adminAuth = createAdminAuth({ store: makeStore(), adminFetch: fetch, isAuthRedirect: () => false, adminSettingsUrl: "/x", updateAdminBar: () => {}, onFetchTimeout });
    await adminAuth.fetchSettings();
    expect(onFetchTimeout).toHaveBeenCalledOnce();

    onFetchTimeout.mockClear();
    global.fetch = vi.fn().mockRejectedValue(new Error("offline"));
    const adminAuth2 = createAdminAuth({ store: makeStore(), adminFetch: fetch, isAuthRedirect: () => false, adminSettingsUrl: "/x", updateAdminBar: () => {}, onFetchTimeout });
    await adminAuth2.fetchSettings();
    expect(onFetchTimeout).not.toHaveBeenCalled();
  });

  it("checkSession() calls onFetchTimeout() on a genuine timeout, not on a generic network error", async () => {
    const onFetchTimeout = vi.fn();
    global.fetch = vi.fn().mockRejectedValue(new DOMException("The operation timed out.", "TimeoutError"));
    const adminAuth = createAdminAuth({ store: makeStore(), adminFetch: fetch, isAuthRedirect: () => false, adminSettingsUrl: "/x", updateAdminBar: () => {}, onFetchTimeout });
    await adminAuth.checkSession();
    expect(onFetchTimeout).toHaveBeenCalledOnce();

    onFetchTimeout.mockClear();
    global.fetch = vi.fn().mockRejectedValue(new Error("offline"));
    const adminAuth2 = createAdminAuth({ store: makeStore(), adminFetch: fetch, isAuthRedirect: () => false, adminSettingsUrl: "/x", updateAdminBar: () => {}, onFetchTimeout });
    await adminAuth2.checkSession();
    expect(onFetchTimeout).not.toHaveBeenCalled();
  });

  it("defaults to a no-op when onFetchTimeout isn't provided at all", async () => {
    global.fetch = vi.fn().mockRejectedValue(new DOMException("The operation timed out.", "TimeoutError"));
    const adminAuth = createAdminAuth({ store: makeStore(), adminFetch: fetch, isAuthRedirect: () => false, adminSettingsUrl: "/x", updateAdminBar: () => {} });
    await expect(adminAuth.fetchSettings()).resolves.not.toThrow();
    await expect(adminAuth.checkSession()).resolves.not.toThrow();
  });
});

describe("checkSession() optimistic login hint", () => {
  it("sets store.isLoggedIn() from the cached hint immediately, before the fetch resolves", async () => {
    localStorage.setItem("logbook_logged_in_hint", "1");
    let resolveFetch;
    global.fetch = vi.fn(() => new Promise(r => { resolveFetch = r; }));
    const store = makeStore();
    const adminAuth = createAdminAuth({ store, adminFetch: fetch, isAuthRedirect: () => false, adminSettingsUrl: "/x", updateAdminBar: () => {} });
    const sessionPromise = adminAuth.checkSession();
    expect(store.isLoggedIn()).toBe(true); // set synchronously, fetch still pending
    resolveFetch({ ok: true, json: async () => ({ user: { username: "nix", email: "nix@example.com" } }) });
    await sessionPromise;
    expect(store.isLoggedIn()).toBe(true); // confirmed for real once the fetch lands
  });

  it("corrects a wrong optimistic hint once the real fetch resolves", async () => {
    localStorage.setItem("logbook_logged_in_hint", "1"); // stale -- session actually lapsed
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => null });
    const store = makeStore();
    const adminAuth = createAdminAuth({ store, adminFetch: fetch, isAuthRedirect: () => false, adminSettingsUrl: "/x", updateAdminBar: () => {} });
    await adminAuth.checkSession();
    expect(store.isLoggedIn()).toBe(false);
  });
});

describe("setInitialActiveType()/reconcileActiveType()", () => {
  it("setInitialActiveType() prefers a cached persisted discipline over the has-entries heuristic", () => {
    localStorage.setItem("logbook_settings_cache", JSON.stringify({ activeDiscipline: "sport" }));
    const store = makeStore();
    store.getEntries = () => [{ type: "boulder" }]; // heuristic would say "boulder" -- cache should win
    const adminAuth = createAdminAuth({ store, adminFetch: fetch, isAuthRedirect: () => false, adminSettingsUrl: "/x", updateAdminBar: () => {} });
    adminAuth.setInitialActiveType();
    expect(store.setActiveType).toHaveBeenCalledWith("sport");
  });

  it("setInitialActiveType() falls back to the has-entries heuristic when nothing is cached", () => {
    const store = makeStore();
    store.getEntries = () => [{ type: "sport" }];
    const adminAuth = createAdminAuth({ store, adminFetch: fetch, isAuthRedirect: () => false, adminSettingsUrl: "/x", updateAdminBar: () => {} });
    adminAuth.setInitialActiveType();
    expect(store.setActiveType).toHaveBeenCalledWith("sport");
  });

  it("setInitialActiveType() defaults to boulder when neither a cache nor any entries exist", () => {
    const store = makeStore();
    const adminAuth = createAdminAuth({ store, adminFetch: fetch, isAuthRedirect: () => false, adminSettingsUrl: "/x", updateAdminBar: () => {} });
    adminAuth.setInitialActiveType();
    expect(store.setActiveType).toHaveBeenCalledWith("boulder");
  });

  it("reconcileActiveType() overrides with the real persisted discipline once both promises resolve", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ activeDiscipline: "sport" }) });
    const store = makeStore();
    const adminAuth = createAdminAuth({ store, adminFetch: fetch, isAuthRedirect: () => false, adminSettingsUrl: "/x", updateAdminBar: () => {} });
    const sessionPromise = Promise.resolve();
    const settingsPromise = adminAuth.fetchSettings();
    await adminAuth.reconcileActiveType(sessionPromise, settingsPromise);
    expect(store.setActiveType).toHaveBeenCalledWith("sport");
  });
});
