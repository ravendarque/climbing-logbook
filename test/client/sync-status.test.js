import { describe, expect, it } from "vitest";
import { isSynced, markSynced } from "../../client/sync-status.js";

// Same fake-storage pattern as test/client/store.test.js -- the Workers
// pool Vitest runs client/ tests under has no localStorage global.
function fakeStorage() {
  const map = new Map();
  return {
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
  };
}

describe("isSynced/markSynced", () => {
  it("isSynced is false when nothing has ever been written", () => {
    expect(isSynced(fakeStorage())).toBe(false);
  });

  it("markSynced then isSynced reports true", () => {
    const storage = fakeStorage();
    markSynced(storage);
    expect(isSynced(storage)).toBe(true);
  });

  it("isSynced is false for corrupt stored JSON", () => {
    const storage = fakeStorage();
    storage.setItem("logbook_sync_status", "{not valid json");
    expect(isSynced(storage)).toBe(false);
  });

  it("isSynced is false for a marker written under a different version", () => {
    const storage = fakeStorage();
    storage.setItem("logbook_sync_status", JSON.stringify({ version: 0, syncedAt: Date.now() }));
    expect(isSynced(storage)).toBe(false);
  });
});
