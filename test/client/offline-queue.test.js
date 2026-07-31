import { describe, expect, it } from "vitest";
import { applyPendingQueue } from "../../client/offline-queue.js";

describe("applyPendingQueue", () => {
  it("does nothing for an empty queue", () => {
    const entries = [{ id: "e1" }];
    applyPendingQueue([], entries, [], []);
    expect(entries).toEqual([{ id: "e1" }]);
  });

  describe("location items", () => {
    it("pushes a new location", () => {
      const locations = [];
      applyPendingQueue([{ kind: "location", record: { id: "l1", name: "Magic Wood" } }], [], [], locations);
      expect(locations).toEqual([{ id: "l1", name: "Magic Wood" }]);
    });

    it("skips a location whose id already exists (dedupe)", () => {
      const locations = [{ id: "l1", name: "Magic Wood" }];
      applyPendingQueue([{ kind: "location", record: { id: "l1", name: "Magic Wood" } }], [], [], locations);
      expect(locations).toHaveLength(1);
    });
  });

  describe("place items", () => {
    it("pushes a new place", () => {
      const places = [];
      applyPendingQueue([{ kind: "place", record: { id: "p1", locationId: "l1" } }], [], places, []);
      expect(places).toEqual([{ id: "p1", locationId: "l1" }]);
    });

    it("skips a place whose id already exists (dedupe)", () => {
      const places = [{ id: "p1", locationId: "l1" }];
      applyPendingQueue([{ kind: "place", record: { id: "p1", locationId: "l1" } }], [], places, []);
      expect(places).toHaveLength(1);
    });
  });

  describe("entry items", () => {
    it("pushes a new entry marked pending on op:add", () => {
      const entries = [];
      applyPendingQueue([{ kind: "entry", op: "add", record: { id: "e1", grade: "6A" } }], entries, [], []);
      expect(entries).toEqual([{ id: "e1", grade: "6A", _pending: true }]);
    });

    it("skips an add whose id already exists (dedupe)", () => {
      const entries = [{ id: "e1", grade: "6A" }];
      applyPendingQueue([{ kind: "entry", op: "add", record: { id: "e1", grade: "6A" } }], entries, [], []);
      expect(entries).toHaveLength(1);
    });

    it("marks a matching entry pending+pendingDelete on op:delete, without removing it", () => {
      const entries = [{ id: "e1", grade: "6A" }];
      applyPendingQueue([{ kind: "entry", op: "delete", record: { id: "e1" } }], entries, [], []);
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({ id: "e1", _pending: true, _pendingDelete: true });
    });

    it("no-ops a delete for an id that isn't present", () => {
      const entries = [{ id: "e1", grade: "6A" }];
      applyPendingQueue([{ kind: "entry", op: "delete", record: { id: "does-not-exist" } }], entries, [], []);
      expect(entries).toEqual([{ id: "e1", grade: "6A" }]);
    });

    it("marks a matching entry pending on op:edit", () => {
      const entries = [{ id: "e1", grade: "6A" }];
      applyPendingQueue([{ kind: "entry", op: "edit", record: { id: "e1", grade: "6B" } }], entries, [], []);
      expect(entries[0]).toEqual({ id: "e1", grade: "6B", _pending: true });
    });

    it("no-ops an edit for an id that isn't present", () => {
      const entries = [{ id: "e1", grade: "6A" }];
      applyPendingQueue([{ kind: "entry", op: "edit", record: { id: "does-not-exist", grade: "6B" } }], entries, [], []);
      expect(entries).toEqual([{ id: "e1", grade: "6A" }]);
    });
  });

  it("applies a mixed queue of locations, places, and entries in order", () => {
    const entries = [{ id: "e1", grade: "6A" }];
    const places = [];
    const locations = [];
    applyPendingQueue(
      [
        { kind: "location", record: { id: "l1", name: "Magic Wood" } },
        { kind: "place", record: { id: "p1", locationId: "l1" } },
        { kind: "entry", op: "add", record: { id: "e2", grade: "7A" } },
        { kind: "entry", op: "delete", record: { id: "e1" } },
      ],
      entries,
      places,
      locations,
    );
    expect(locations).toEqual([{ id: "l1", name: "Magic Wood" }]);
    expect(places).toEqual([{ id: "p1", locationId: "l1" }]);
    expect(entries).toHaveLength(2);
    expect(entries.find(e => e.id === "e2")).toMatchObject({ _pending: true });
    expect(entries.find(e => e.id === "e1")).toMatchObject({ _pending: true, _pendingDelete: true });
  });
});
