// @vitest-environment happy-dom
//
// Unlike server-side tests, this module renders real DOM (select options,
// row cards) and needs a document -- the Cloudflare Workers pool
// (vitest.config.js's default for test/**/*.test.js) has none. happy-dom
// is already a project dependency (confirmed via package.json) used the
// same way by other client-side DOM tests in test/client/.
import { beforeEach, describe, expect, it } from "vitest";
import { createMoveRowList } from "../../client/move-tagging.js";

let listEl, addBtnEl;

beforeEach(() => {
  document.body.innerHTML = `<div id="list"></div><button id="add"></button>`;
  listEl = document.getElementById("list");
  addBtnEl = document.getElementById("add");
});

describe("createMoveRowList", () => {
  it("starts with zero rows", () => {
    const widget = createMoveRowList({ listEl, addBtnEl, hasDifficulty: false });
    expect(widget.getRows()).toEqual([]);
  });

  it("adds a row with sensible defaults when the add button is clicked", () => {
    const widget = createMoveRowList({ listEl, addBtnEl, hasDifficulty: false });
    addBtnEl.click();
    const rows = widget.getRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ limb: "hand", side: "left", wallAngle: "slab" });
  });

  it("carries a difficulty field when hasDifficulty + defaultDifficulty are set", () => {
    const widget = createMoveRowList({ listEl, addBtnEl, hasDifficulty: true, defaultDifficulty: "hardest" });
    addBtnEl.click();
    expect(widget.getRows()[0].difficulty).toBe("hardest");
  });

  it("omits difficulty entirely when hasDifficulty is false", () => {
    const widget = createMoveRowList({ listEl, addBtnEl, hasDifficulty: false });
    addBtnEl.click();
    expect(widget.getRows()[0].difficulty).toBeUndefined();
  });

  it("removes a row when its remove button is clicked", () => {
    const widget = createMoveRowList({ listEl, addBtnEl, hasDifficulty: false });
    addBtnEl.click();
    addBtnEl.click();
    expect(widget.getRows()).toHaveLength(2);
    listEl.querySelector("[data-remove-row]").click();
    expect(widget.getRows()).toHaveLength(1);
  });

  it("re-filters hold type and movement style options when limb changes, defaulting to the new limb's first option", () => {
    const widget = createMoveRowList({ listEl, addBtnEl, hasDifficulty: false });
    addBtnEl.click();
    const limbSelect = listEl.querySelector('[data-field="limbSide"]');
    limbSelect.value = "foot-right";
    limbSelect.dispatchEvent(new Event("change", { bubbles: true }));

    const row = widget.getRows()[0];
    expect(row.limb).toBe("foot");
    expect(row.side).toBe("right");
    expect(row.holdType).toBe("toe-hook");
    expect(["static", "dynamic"]).toContain(row.movementStyle);
    expect(row.movementStyle).not.toBe("lockoff");
  });

  it("setRows() replaces the current rows and reflects them in getRows()", () => {
    const widget = createMoveRowList({ listEl, addBtnEl, hasDifficulty: true });
    addBtnEl.click();
    widget.setRows([
      { difficulty: "easiest", limb: "knee", side: "left", holdType: "kneebar", movementStyle: "static", wallAngle: "roof" },
    ]);
    const rows = widget.getRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({ difficulty: "easiest", limb: "knee", side: "left", holdType: "kneebar", movementStyle: "static", wallAngle: "roof" });
  });

  it("reset() clears to zero rows", () => {
    const widget = createMoveRowList({ listEl, addBtnEl, hasDifficulty: false });
    addBtnEl.click();
    addBtnEl.click();
    widget.reset();
    expect(widget.getRows()).toEqual([]);
  });

  // #597 -- every dropdown renders sentence case, not Title Case or the
  // raw hyphenated vocabulary value verbatim.
  it("renders the Limb dropdown's options in sentence case", () => {
    const widget = createMoveRowList({ listEl, addBtnEl, hasDifficulty: false });
    addBtnEl.click();
    const limbOptionText = Array.from(listEl.querySelectorAll('[data-field="limbSide"] option')).map(o => o.textContent);
    expect(limbOptionText).toContain("Left hand");
    expect(limbOptionText).not.toContain("Left Hand");
  });

  it("renders raw hold-type/movement-style/wall-angle option text humanized, while keeping the raw value in the option's value attribute", () => {
    const widget = createMoveRowList({ listEl, addBtnEl, hasDifficulty: false });
    addBtnEl.click();
    const holdOption = listEl.querySelector('[data-field="holdType"] option[value="toe-hook"]');
    expect(holdOption).toBeNull(); // hand is the default limb -- toe-hook only appears once limb is foot
    const limbSelect = listEl.querySelector('[data-field="limbSide"]');
    limbSelect.value = "foot-right";
    limbSelect.dispatchEvent(new Event("change", { bubbles: true }));
    const toeHookOption = listEl.querySelector('[data-field="holdType"] option[value="toe-hook"]');
    expect(toeHookOption.textContent).toBe("Toe hook");
  });

  it("every select in a row card has an explicit foreground text color (dark-mode readability, #597)", () => {
    const widget = createMoveRowList({ listEl, addBtnEl, hasDifficulty: false });
    addBtnEl.click();
    const selects = listEl.querySelectorAll("select");
    expect(selects.length).toBeGreaterThan(0);
    selects.forEach(select => expect(select.className).toContain("text-foreground"));
  });
});
