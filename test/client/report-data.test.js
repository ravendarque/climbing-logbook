import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createReportData } from "../../client/report-data.js";

function fakeStore({ cached }) {
  let entries = [];
  return {
    loadEntriesFromCache: async () => {
      if (cached) entries = cached;
      return Boolean(cached);
    },
    applyPendingQueue: () => {},
    getEntries: () => entries,
    mergeConfirmed: async () => true,
  };
}

const syncStatusIcon = { track: promise => promise, reportTimeout: () => {} };
const build = (entries, params) => ({ ids: entries.map(e => e.id), params });

beforeEach(() => {
  localStorage.setItem("logbook_sync_status", JSON.stringify({ version: 1 }));
});
afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe("createReportData (#1100)", () => {
  it("builds the report on the device, leaving out a queued delete", async () => {
    const store = fakeStore({ cached: [{ id: "kept" }, { id: "going", _pendingDelete: true }] });
    const reports = createReportData({ username: "nix", isDemo: false, store, syncStatusIcon, onRefresh: () => {} });
    expect(await reports.open()).toBe(true);
    expect(await reports.report("performance/gap", build, { start: "2026-01-01" })).toEqual({
      ids: ["kept"],
      params: { start: "2026-01-01" },
    });
  });

  it("asks the server when the device has no usable copy, without empty parameters", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ from: "server" })));
    vi.stubGlobal("fetch", fetchMock);
    const reports = createReportData({
      username: "nix",
      isDemo: false,
      store: fakeStore({ cached: null }),
      syncStatusIcon,
      onRefresh: () => {},
    });
    await reports.open();
    expect(await reports.report("performance/strengths", build, { dimension: null, value: undefined })).toEqual({
      from: "server",
    });
    expect(fetchMock).toHaveBeenCalledWith("/-/api/performance/strengths");
  });

  it("sends a demo to its public route", async () => {
    const fetchMock = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);
    const reports = createReportData({
      username: "beginnerdemo",
      isDemo: true,
      store: fakeStore({ cached: null }),
      syncStatusIcon,
      onRefresh: () => {},
    });
    await reports.open();
    await reports.report("performance/volume", build, { start: "2026-01-01", end: "2026-03-01" });
    expect(fetchMock).toHaveBeenCalledWith(
      "/-/api/public/beginnerdemo/performance/volume?start=2026-01-01&end=2026-03-01",
    );
  });

  it("throws on a server error, so the page can show it's offline", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 500 })),
    );
    const reports = createReportData({
      username: "nix",
      isDemo: false,
      store: fakeStore({ cached: null }),
      syncStatusIcon,
      onRefresh: () => {},
    });
    await reports.open();
    await expect(reports.report("performance/injury", build)).rejects.toThrow("HTTP 500");
  });

  it("refreshes only a device-held copy, then tells the page", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ entries: [], cursor: 1 }))),
    );
    const onRefresh = vi.fn();
    const local = createReportData({
      username: "nix",
      isDemo: false,
      store: fakeStore({ cached: [] }),
      syncStatusIcon,
      onRefresh,
    });
    await local.open();
    await local.refresh();
    expect(onRefresh).toHaveBeenCalledTimes(1);

    const remote = createReportData({
      username: "nix",
      isDemo: false,
      store: fakeStore({ cached: null }),
      syncStatusIcon,
      onRefresh,
    });
    await remote.open();
    await remote.refresh();
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});
