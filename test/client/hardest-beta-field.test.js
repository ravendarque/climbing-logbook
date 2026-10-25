import { beforeEach, describe, expect, it } from "vitest";
import { createHardestBetaField } from "../../client/hardest-beta-field.js";

let input;
let field;
let parts;

beforeEach(async () => {
  document.body.innerHTML = `
    <textarea id="beta"></textarea>
    <div id="reading" hidden>
      <p id="readback"></p><div id="chips"></div><div id="panel" hidden></div><ol id="steps"></ol>
    </div>`;
  input = document.getElementById("beta");
  parts = {
    reading: document.getElementById("reading"),
    readback: document.getElementById("readback"),
    chips: document.getElementById("chips"),
    panel: document.getElementById("panel"),
    steps: document.getElementById("steps"),
  };
  field = createHardestBetaField({ input, ...parts });
  await field.ready();
});

const type = text => {
  input.value = text;
  input.dispatchEvent(new Event("input"));
};
const chipLabels = () => [...parts.chips.querySelectorAll("button")].map(b => b.textContent);
const answer = label => [...parts.panel.querySelectorAll("button")].find(b => b.textContent === label).click();

describe("createHardestBetaField (#1522)", () => {
  it("shows nothing until there's beta to read", () => {
    field.setValue("");
    expect(parts.reading.hidden).toBe(true);
    type("  ");
    expect(parts.reading.hidden).toBe(true);
  });

  it("marks each word by what it was read as, keeping the text as written", () => {
    type("Right heel hook on the lip, cross to a sidepull crimp");
    expect(parts.reading.hidden).toBe(false);
    expect(parts.readback.textContent).toBe("Right heel hook on the lip, cross to a sidepull crimp");
    expect(parts.readback.querySelector("mark.beta-position").textContent).toBe("heel hook");
    expect(parts.readback.querySelector("mark.beta-transition").textContent).toBe("cross");
  });

  it("reads the beta back as steps, with the crux marked", () => {
    type("Right heel hook on the lip, then deadpoint to the sloper, crux");
    const steps = [...parts.steps.querySelectorAll("li")].map(li => li.textContent);
    expect(steps).toHaveLength(2);
    expect(steps[1]).toContain("Crux");
  });

  it("settles an ambiguous word by rewriting it in the text", () => {
    type("jam in the crack");
    expect(chipLabels()).toEqual(["jam?"]);
    const chip = parts.chips.querySelector("button");
    expect(chip.getAttribute("aria-label")).toBe("Check “jam”");
    expect(chip.getAttribute("aria-controls")).toBe("panel");
    chip.click();
    expect(parts.chips.querySelector("button").getAttribute("aria-expanded")).toBe("true");
    expect(parts.panel.hidden).toBe(false);
    answer("Jam/Wedge");
    expect(input.value).toBe("foot jam in the crack");
    expect(chipLabels()).toEqual([]);
    expect(field.getValue()).toBe("foot jam in the crack");
  });

  it("offers a correction for a word it doesn't know, or keeps it as written", () => {
    type("campus to the jugg, gubbins to the horn");
    expect(chipLabels()).toEqual(["jugg?", "gubbins?"]);
    parts.chips.querySelector("button").click();
    answer("Use “jug”");
    expect(input.value).toBe("campus to the jug, gubbins to the horn");

    parts.chips.querySelector("button").click();
    answer("Keep as written");
    expect(input.value).toBe("campus to the jug, gubbins to the horn");
    expect(chipLabels()).toEqual([]);
  });

  it("forgets dismissed words when another climb is loaded", () => {
    type("gubbins to the horn");
    parts.chips.querySelector("button").click();
    answer("Keep as written");
    field.setValue("gubbins to the horn");
    expect(chipLabels()).toEqual(["gubbins?"]);
  });

  it("saves trimmed text, or nothing when it's empty", () => {
    type("  dyno to the jug  ");
    expect(field.getValue()).toBe("dyno to the jug");
    type("   ");
    expect(field.getValue()).toBeNull();
  });
});
