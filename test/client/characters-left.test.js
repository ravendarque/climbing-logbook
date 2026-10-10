// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { showCharactersLeft } from "../../client/characters-left.js";

function setUp(maxLength = 5000) {
  document.body.innerHTML = `<form><textarea id="field"></textarea><p id="count"></p></form>`;
  const field = /** @type {HTMLTextAreaElement} */ (document.getElementById("field"));
  field.maxLength = maxLength;
  const counter = document.getElementById("count");
  return { field, counter, update: showCharactersLeft(field, counter) };
}

describe("showCharactersLeft (#1044)", () => {
  it("shows the field's whole limit to begin with, and links itself as the field's description", () => {
    const { field, counter } = setUp();
    expect(counter.textContent).toBe("5,000 characters left");
    expect(field.getAttribute("aria-describedby")).toBe("count");
  });

  it("counts down as someone types, and says 1 character", () => {
    const { field, counter } = setUp(10);
    field.value = "123456789";
    field.dispatchEvent(new Event("input"));
    expect(counter.textContent).toBe("1 character left");
  });

  it("catches up when the page sets the value itself", () => {
    const { field, counter, update } = setUp(10);
    field.value = "1234";
    update();
    expect(counter.textContent).toBe("6 characters left");
  });

  it("goes back to the whole limit when the form is reset", async () => {
    const { field, counter } = setUp(10);
    field.value = "1234";
    field.dispatchEvent(new Event("input"));
    field.form.reset();
    await new Promise(resolve => setTimeout(resolve));
    expect(counter.textContent).toBe("10 characters left");
  });
});
