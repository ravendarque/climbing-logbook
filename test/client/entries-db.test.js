import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";
import { openEntriesDb } from "../../client/entries-db.js";
import { mergeDelta } from "../../client/delta-merge.js";

const ROWS = [
  { id: "b", name: "First" },
  { id: "a", name: "Second" },
  { id: "c", name: "Third" },
];

let factory, db;
beforeEach(async () => {
  factory = new IDBFactory();
  db = await openEntriesDb("logbook_entries:test", factory);
});

describe("entries database (#1164)", () => {
  it("tells a never-written cache from an empty one", async () => {
    expect(await db.isCached()).toBe(false);
    expect(await db.load()).toBeNull();
    await db.replace([]);
    expect(await db.isCached()).toBe(true);
    expect(await db.load()).toEqual([]);
  });

  it("loads rows in the order they were written, not id order", async () => {
    await db.replace(ROWS);
    expect(await db.load()).toEqual(ROWS);
  });

  it("applies a delta the way mergeDelta does: in place, appended, deleted, flag dropped", async () => {
    await db.replace(ROWS);
    const delta = [
      { id: "new", name: "Added" },
      { id: "a", name: "Renamed", deleted: false },
      { id: "c", deleted: true },
    ];
    await db.apply(delta);
    expect(await db.load()).toEqual(mergeDelta(ROWS, delta));
  });

  it("applies onto an empty database, which then counts as cached", async () => {
    await db.apply([{ id: "x", name: "Only" }]);
    expect(await db.load()).toEqual([{ id: "x", name: "Only" }]);
  });

  it("replaces everything, dropping rows the new list leaves out", async () => {
    await db.replace(ROWS);
    await db.replace([{ id: "z", name: "Fresh" }]);
    expect(await db.load()).toEqual([{ id: "z", name: "Fresh" }]);
  });

  it("clears back to never cached", async () => {
    await db.replace(ROWS);
    await db.clear();
    expect(await db.load()).toBeNull();
  });

  it("rolls a failed write back whole and rejects", async () => {
    await db.replace(ROWS);
    await expect(db.apply([{ id: "d", name: "Would add" }, { name: "No id" }])).rejects.toBeTruthy();
    expect(await db.load()).toEqual(ROWS);
  });

  it("sees writes from another connection, as another tab would", async () => {
    const otherTab = await openEntriesDb("logbook_entries:test", factory);
    await db.replace(ROWS);
    await otherTab.apply([{ id: "tab2", name: "From the other tab" }]);
    await db.apply([{ id: "tab1", name: "From this tab" }]);
    expect((await db.load()).map(row => row.id)).toEqual(["b", "a", "c", "tab2", "tab1"]);
  });

  it("keeps each user's database separate", async () => {
    const other = await openEntriesDb("logbook_entries:someoneelse", factory);
    await db.replace(ROWS);
    expect(await other.load()).toBeNull();
  });
});
