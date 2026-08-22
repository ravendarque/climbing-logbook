import { describe, expect, it } from "vitest";
import { mergeDelta } from "../../client/delta-merge.js";

describe("mergeDelta", () => {
  it("appends a genuinely new row", () => {
    const current = [{ id: "a", name: "Existing" }];
    const merged = mergeDelta(current, [{ id: "b", name: "New", deleted: false }]);
    expect(merged.map(r => r.id)).toEqual(["a", "b"]);
  });

  it("upserts an existing row by id, keeping its original position", () => {
    const current = [{ id: "a", name: "Old" }, { id: "b", name: "Untouched" }];
    const merged = mergeDelta(current, [{ id: "a", name: "Updated", deleted: false }]);
    expect(merged.map(r => r.id)).toEqual(["a", "b"]);
    expect(merged[0]).toEqual({ id: "a", name: "Updated" });
  });

  it("removes a row flagged deleted: true", () => {
    const current = [{ id: "a", name: "Gone soon" }, { id: "b", name: "Stays" }];
    const merged = mergeDelta(current, [{ id: "a", deleted: true }]);
    expect(merged.map(r => r.id)).toEqual(["b"]);
  });

  it("is a no-op deletion for an id that was never present locally", () => {
    const current = [{ id: "b", name: "Stays" }];
    const merged = mergeDelta(current, [{ id: "a", deleted: true }]);
    expect(merged.map(r => r.id)).toEqual(["b"]);
  });

  // #500 -- the `deleted` flag itself must never survive into a live
  // row's stored shape, or an entry that passed through a delta merge
  // would be shaped differently (deleted: false) from one that only
  // ever came from a cold/chunked fetch (no such field at all).
  it("strips the deleted flag off a surviving row", () => {
    const merged = mergeDelta([], [{ id: "a", name: "New", deleted: false }]);
    expect(merged).toEqual([{ id: "a", name: "New" }]);
  });

  it("does not mutate the array passed in as current", () => {
    const current = [{ id: "a", name: "Old" }];
    mergeDelta(current, [{ id: "a", name: "Updated", deleted: false }]);
    expect(current).toEqual([{ id: "a", name: "Old" }]);
  });

  it("an empty delta returns every current row unchanged", () => {
    const current = [{ id: "a", name: "Only" }];
    expect(mergeDelta(current, [])).toEqual(current);
  });
});
