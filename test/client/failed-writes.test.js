import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  addFailedWrite,
  createFailedWritesBanner,
  getFailedWrites,
  isPermanentFailure,
  removeFailedWrite,
} from "../../client/failed-writes.js";

function memoryStorage() {
  const map = new Map();
  return { getItem: k => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)) };
}

const add = { qid: "q1", kind: "entry", op: "add", record: { id: "e1", name: "Big <Roof>" } };
const del = { qid: "q2", kind: "entry", op: "delete", record: { id: "e2", name: "Gone" } };
const place = { qid: "q3", kind: "place", op: "add", record: { id: "p1", area: "Sector 1" } };

describe("isPermanentFailure", () => {
  it.each([400, 403, 404, 409, 422])("treats %i as permanent", status => {
    expect(isPermanentFailure(status)).toBe(true);
  });
  it.each([401, 408, 429, 500, 502, 503])("treats %i as worth retrying or handled elsewhere", status => {
    expect(isPermanentFailure(status)).toBe(false);
  });
});

describe("the failed-writes list", () => {
  it("adds with a reason and removes by queue id", () => {
    const storage = memoryStorage();
    addFailedWrite(add, "grade is not valid", storage);
    addFailedWrite(del, "Error 404", storage);
    removeFailedWrite("q1", storage);
    expect(getFailedWrites(storage)).toEqual([{ ...del, reason: "Error 404" }]);
  });
});

describe("the failed-writes banner", () => {
  let el;
  beforeEach(() => {
    document.body.innerHTML = `<ul id="failed-writes" hidden></ul>`;
    el = document.getElementById("failed-writes");
  });

  it("offers Edit only for an entry's add or edit, and escapes names and reasons", () => {
    const banner = createFailedWritesBanner({ el, onEdit: () => {}, onDiscard: () => {} });
    banner.render([
      { ...add, reason: "bad <b>grade</b>" },
      { ...del, reason: "Error 404" },
      { ...place, reason: "Error 400" },
    ]);

    expect(el.hidden).toBe(false);
    const lines = [...el.querySelectorAll("li")];
    expect(lines.map(li => li.querySelectorAll("[data-action=edit]").length)).toEqual([1, 0, 0]);
    expect(lines[0].textContent).toContain("Couldn't save “Big <Roof>”: bad <b>grade</b>");
    expect(el.querySelector("b")).toBeNull();
  });

  it("calls back with the item, and hides when empty", () => {
    const onEdit = vi.fn();
    const onDiscard = vi.fn();
    const banner = createFailedWritesBanner({ el, onEdit, onDiscard });
    banner.render([{ ...add, reason: "x" }]);

    el.querySelector("[data-action=edit]").click();
    el.querySelector("[data-action=discard]").click();
    expect(onEdit).toHaveBeenCalledWith({ ...add, reason: "x" });
    expect(onDiscard).toHaveBeenCalledWith({ ...add, reason: "x" });

    banner.render([]);
    expect(el.hidden).toBe(true);
  });
});
