// #960 -- per-user localStorage namespacing (client/user-storage.js).
import { describe, expect, it } from "vitest";
import { adoptLegacyUserData, ownerOfPath, PER_USER_KEYS, readSignedInUser, SIGNED_IN_USER_KEY, userKey, writeSignedInUser, clearSignedInUser } from "../../client/user-storage.js";

function memoryStorage(entries = {}) {
  const map = new Map(Object.entries(entries));
  return {
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: k => map.delete(k),
    dump: () => Object.fromEntries(map),
  };
}

describe("userKey / ownerOfPath", () => {
  it("namespaces a key to the owner page's username, normalised", () => {
    expect(userKey("logbook_entries_cache", "/raven/log")).toBe("logbook_entries_cache:raven");
    expect(userKey("logbook_entries_cache", "/Raven/performance/rpe")).toBe("logbook_entries_cache:raven");
    expect(ownerOfPath("/r%61ven/map")).toBe("raven");
  });

  it("leaves the key alone anywhere that isn't an owner page", () => {
    for (const path of ["/", "/raven", "/help/", "/e2e-fixtures/pages/log.html", "/login/"]) {
      expect(userKey("logbook_entries_cache", path), path).toBe("logbook_entries_cache");
    }
  });

  it("with no location at all (the Workers test pool), uses the plain key", () => {
    expect(userKey("logbook_sync_status")).toBe("logbook_sync_status");
  });
});

describe("signed-in user record", () => {
  it("writes lower-case, reads, clears", () => {
    const s = memoryStorage();
    expect(readSignedInUser(s)).toBeNull();
    writeSignedInUser(s, "Raven");
    expect(readSignedInUser(s)).toBe("raven");
    clearSignedInUser(s);
    expect(readSignedInUser(s)).toBeNull();
  });
});

describe("adoptLegacyUserData", () => {
  it("moves every pre-#960 per-user key into the user's namespace", () => {
    const legacy = Object.fromEntries(PER_USER_KEYS.map(k => [k, `v-${k}`]));
    const s = memoryStorage({ ...legacy, logbook_theme: "dark", [SIGNED_IN_USER_KEY]: "x" });
    adoptLegacyUserData(s, "Raven");
    const out = s.dump();
    for (const k of PER_USER_KEYS) {
      expect(out[k], k).toBeUndefined();
      expect(out[`${k}:raven`], k).toBe(`v-${k}`);
    }
    expect(out.logbook_theme).toBe("dark");
  });

  it("never overwrites data already in the namespace, but still removes the legacy copy", () => {
    const s = memoryStorage({ logbook_pending_queue: "old", "logbook_pending_queue:raven": "current" });
    adoptLegacyUserData(s, "raven");
    expect(s.dump()).toEqual({ "logbook_pending_queue:raven": "current" });
  });
});
