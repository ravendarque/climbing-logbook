import { IDBFactory } from "fake-indexeddb";
import { afterEach, describe, expect, it } from "vitest";
import { removeDeviceData, unsyncedChangeCount } from "../../client/device-data.js";
import { openEntriesDb } from "../../client/entries-db.js";

afterEach(() => {
  localStorage.clear();
});

async function databaseNames(factory) {
  return (await factory.databases()).map(db => db.name).toSorted();
}

describe("removeDeviceData (#1220)", () => {
  it("removes every key belonging to this user, and nothing else", async () => {
    for (const key of [
      "logbook_places_cache:nix",
      "logbook_pending_queue:nix",
      "logbook_failed_writes:nix",
      "logbook_settings_cache:nix",
      "logbook_sync_cursors:nix",
      "logbook_sync_status:nix",
      "logbook_places_cache:someoneelse",
      "logbook_places_cache:unix",
      "logbook_theme",
      "logbook_grade_scale_reports_boulder",
    ]) {
      localStorage.setItem(key, "x");
    }

    expect(await removeDeviceData("nix", { factory: new IDBFactory() })).toBe(true);

    expect(Object.keys(localStorage).toSorted()).toEqual([
      "logbook_grade_scale_reports_boulder",
      "logbook_places_cache:someoneelse",
      "logbook_places_cache:unix",
      "logbook_theme",
    ]);
  });

  it("matches the username however it's cased", async () => {
    localStorage.setItem("logbook_places_cache:nix", "x");
    await removeDeviceData("Nix", { factory: new IDBFactory() });
    expect(localStorage.getItem("logbook_places_cache:nix")).toBeNull();
  });

  it("deletes this user's entries database, and only theirs", async () => {
    const factory = new IDBFactory();
    for (const owner of ["nix", "someoneelse"]) {
      const db = await openEntriesDb(`logbook_entries:${owner}`, factory);
      await db.replace([{ id: "e1" }]);
    }

    expect(await removeDeviceData("nix", { factory })).toBe(true);

    expect(await databaseNames(factory)).toEqual(["logbook_entries:someoneelse"]);
  });

  it("succeeds on a browser with no IndexedDB, having nothing there to remove", async () => {
    localStorage.setItem("logbook_places_cache:nix", "x");
    expect(await removeDeviceData("nix", { factory: undefined })).toBe(true);
    expect(localStorage.getItem("logbook_places_cache:nix")).toBeNull();
  });

  it("reports failure when the database can't be deleted, but still removes the local keys", async () => {
    localStorage.setItem("logbook_places_cache:nix", "x");
    const failing = {
      deleteDatabase() {
        const request = {};
        queueMicrotask(() => request.onerror());
        return request;
      },
    };
    expect(await removeDeviceData("nix", { factory: failing })).toBe(false);
    expect(localStorage.getItem("logbook_places_cache:nix")).toBeNull();
  });

  it("reports failure when another tab keeps the database open and never lets go", async () => {
    const stuck = { deleteDatabase: () => ({}) };
    const started = Date.now();
    expect(await removeDeviceData("nix", { factory: stuck })).toBe(false);
    expect(Date.now() - started).toBeGreaterThanOrEqual(4500);
  }, 10000);

  it("reports failure when the local keys can't be cleared", async () => {
    const storage = {
      removeItem() {
        throw new DOMException("denied", "SecurityError");
      },
    };
    Object.defineProperty(storage, "a:nix", { value: "x", enumerable: true });
    expect(await removeDeviceData("nix", { storage, factory: undefined })).toBe(false);
  });
});

describe("unsyncedChangeCount", () => {
  it("counts queued changes and ones that couldn't be saved", () => {
    expect(unsyncedChangeCount()).toBe(0);
    localStorage.setItem("logbook_pending_queue", JSON.stringify([{ qid: "a" }, { qid: "b" }]));
    localStorage.setItem("logbook_failed_writes", JSON.stringify([{ qid: "c", reason: "No" }]));
    expect(unsyncedChangeCount()).toBe(3);
  });

  it("is zero when the stored lists are corrupt", () => {
    localStorage.setItem("logbook_pending_queue", "{not json");
    localStorage.setItem("logbook_failed_writes", "{not json");
    expect(unsyncedChangeCount()).toBe(0);
  });
});
