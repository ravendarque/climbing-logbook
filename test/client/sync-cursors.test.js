import { describe, expect, it } from "vitest";
import { getCursor, setCursor } from "../../client/sync-cursors.js";

// Same fake-storage pattern as test/client/sync-status.test.js -- the
// Workers pool Vitest runs client/ tests under has no localStorage
// global.
function fakeStorage() {
  const map = new Map();
  return {
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
  };
}

describe("getCursor/setCursor", () => {
  it("defaults to 0 for a table that's never been recorded", () => {
    expect(getCursor("entries", fakeStorage())).toBe(0);
  });

  it("setCursor then getCursor round-trips the value", () => {
    const storage = fakeStorage();
    setCursor("entries", 12345, storage);
    expect(getCursor("entries", storage)).toBe(12345);
  });

  // #500 -- each table's own sync_cursor sequence is independent
  // (server/lib/d1-resource.js's own reasoning) -- setting one table's
  // cursor must never disturb another's.
  it("tracks each table's cursor independently", () => {
    const storage = fakeStorage();
    setCursor("entries", 100, storage);
    setCursor("places", 200, storage);
    setCursor("locations", 300, storage);

    expect(getCursor("entries", storage)).toBe(100);
    expect(getCursor("places", storage)).toBe(200);
    expect(getCursor("locations", storage)).toBe(300);
  });

  it("overwrites only the named table on a second setCursor call", () => {
    const storage = fakeStorage();
    setCursor("entries", 100, storage);
    setCursor("places", 200, storage);
    setCursor("entries", 150, storage);

    expect(getCursor("entries", storage)).toBe(150);
    expect(getCursor("places", storage)).toBe(200);
  });

  it("defaults to 0 for corrupt stored JSON, rather than throwing", () => {
    const storage = fakeStorage();
    storage.setItem("logbook_sync_cursors", "{not valid json");
    expect(getCursor("entries", storage)).toBe(0);
  });

  it("defaults to 0 when the stored value isn't a number", () => {
    const storage = fakeStorage();
    storage.setItem("logbook_sync_cursors", JSON.stringify({ entries: "not-a-number" }));
    expect(getCursor("entries", storage)).toBe(0);
  });
});
