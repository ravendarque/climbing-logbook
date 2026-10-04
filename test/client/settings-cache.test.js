import { afterEach, describe, expect, it, vi } from "vitest";
import { pullSettings, readSettingsCache, SETTINGS_CACHE_KEY } from "../../client/settings-cache.js";

const SERVER = { athleteMode: true, logbookPublic: false, betaOptIn: true, activeDiscipline: "sport" };

function answer(body, ok = true) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok, json: async () => body })),
  );
}

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe("pullSettings (#1177)", () => {
  it("returns the server's settings and caches them for the next page to paint with", async () => {
    answer(SERVER);
    expect(await pullSettings()).toEqual(SERVER);
    expect(readSettingsCache()).toEqual(SERVER);
  });

  it("normalises what the server sends: flags to booleans, and betaOptIn only when exactly true", async () => {
    answer({ athleteMode: 1, logbookPublic: 0, betaOptIn: "yes", activeDiscipline: "boulder" });
    expect(await pullSettings()).toEqual({
      athleteMode: true,
      logbookPublic: false,
      betaOptIn: false,
      activeDiscipline: "boulder",
    });
  });

  it("keeps the cached discipline when the server's isn't one we know, and has none when neither is", async () => {
    localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify({ activeDiscipline: "sport" }));
    answer({ ...SERVER, activeDiscipline: "kayak" });
    expect((await pullSettings()).activeDiscipline).toBe("sport");

    localStorage.clear();
    answer({ ...SERVER, activeDiscipline: "kayak" });
    expect((await pullSettings()).activeDiscipline).toBeNull();
  });

  it("leaves the cache alone and returns null when the server refuses", async () => {
    localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(SERVER));
    answer({ error: "Unauthorized" }, false);
    expect(await pullSettings()).toBeNull();
    expect(readSettingsCache()).toEqual(SERVER);
  });

  it("returns null rather than throwing when the network fails, and says nothing about it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    const onTimeout = vi.fn();
    expect(await pullSettings({ onTimeout })).toBeNull();
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it("reports a real timeout, so the sync indicator can flag a dead link", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new DOMException("The operation timed out", "TimeoutError");
      }),
    );
    const onTimeout = vi.fn();
    expect(await pullSettings({ onTimeout })).toBeNull();
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it("still returns the fetched settings when the device has no room to cache them", async () => {
    answer(SERVER);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    expect(await pullSettings()).toEqual(SERVER);
    vi.restoreAllMocks();
  });
});

describe("readSettingsCache", () => {
  it("is null when nothing is cached, or the cached value is corrupt", () => {
    expect(readSettingsCache()).toBeNull();
    localStorage.setItem(SETTINGS_CACHE_KEY, "{not json");
    expect(readSettingsCache()).toBeNull();
  });
});
