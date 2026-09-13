// @vitest-environment happy-dom
// Focused on createDisclosure's destroy() (#736) -- the mechanism itself
// (open/close/outside-click/Escape) already has solid indirect coverage
// through every real consumer's own e2e tests (discipline picker, header
// menu, place picker, filter panel, the grade/scale pickers, and now
// client/calendar-date-picker.js's own dedicated unit tests), unchanged
// by this addition. destroy() is new behavior with no other test surface
// at all, since no existing caller ever needed to tear one down before
// this.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDisclosure } from "../../client/modal-utils.js";

let trigger, panel, wrap;

beforeEach(() => {
  document.body.innerHTML = `
    <div id="wrap">
      <button id="trigger"></button>
      <div id="panel" hidden></div>
    </div>`;
  wrap = document.getElementById("wrap");
  trigger = document.getElementById("trigger");
  panel = document.getElementById("panel");
});

describe("createDisclosure destroy()", () => {
  it("stops the trigger from opening the panel after destroy()", () => {
    const { destroy } = createDisclosure(trigger, panel, "#wrap");
    destroy();
    trigger.click();
    expect(panel.hidden).toBe(true);
  });

  it("stops outside clicks from closing an already-open panel after destroy()", () => {
    const { open, destroy } = createDisclosure(trigger, panel, "#wrap");
    open();
    destroy();
    document.body.click();
    expect(panel.hidden).toBe(false); // outside-click listener no longer attached
  });

  it("stops Escape from closing the panel after destroy()", () => {
    const { open, destroy } = createDisclosure(trigger, panel, "#wrap");
    open();
    destroy();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(panel.hidden).toBe(false);
  });

  it("leaves other, non-destroyed instances fully working", () => {
    document.body.innerHTML = `
      <div id="wrap"><button id="trigger"></button><div id="panel" hidden></div></div>
      <div id="wrap2"><button id="trigger2"></button><div id="panel2" hidden></div></div>`;
    const t1 = document.getElementById("trigger"), p1 = document.getElementById("panel");
    const t2 = document.getElementById("trigger2"), p2 = document.getElementById("panel2");
    const d1 = createDisclosure(t1, p1, "#wrap");
    createDisclosure(t2, p2, "#wrap2");
    d1.destroy();
    t1.click();
    expect(p1.hidden).toBe(true); // destroyed
    t2.click();
    expect(p2.hidden).toBe(false); // untouched
  });

  it("does not leak a growing number of document listeners across repeated create+destroy cycles", () => {
    // createDisclosure attaches two document-level listeners per call
    // (outside-click, and Escape via the default escapeTarget=document)
    // -- every one of them needs a matching removal, or they'd
    // accumulate forever across repeated create+destroy cycles (exactly
    // what client/time-window.js's Custom range does on every state
    // change, see that file's own comment).
    const addSpy = vi.spyOn(document, "addEventListener");
    const removeSpy = vi.spyOn(document, "removeEventListener");
    for (let i = 0; i < 5; i++) {
      const { destroy } = createDisclosure(trigger, panel, "#wrap");
      destroy();
    }
    expect(removeSpy.mock.calls.length).toBe(addSpy.mock.calls.length);
    expect(addSpy.mock.calls.length).toBe(10); // 2 per cycle x 5 cycles
    addSpy.mockRestore();
    removeSpy.mockRestore();
  });
});
