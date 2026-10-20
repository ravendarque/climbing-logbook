import { describe, expect, it } from "vitest";
import { preselectSection } from "../../client/preselect-section.js";

function select() {
  document.body.innerHTML = `<select id="s"><option value="">Not sure / other</option><option value="logbook">Logbook</option></select>`;
  return document.getElementById("s");
}

describe("preselectSection", () => {
  it("selects the area of the page the visitor came from", () => {
    const s = select();
    preselectSection(s, "https://my.climbinglogbook.com/raven/log");
    expect(s.value).toBe("logbook");
  });

  it("keeps Not sure / other when the form has no option for that area", () => {
    const s = select();
    preselectSection(s, "https://my.climbinglogbook.com/raven");
    expect(s.value).toBe("");
    expect(s.selectedIndex).toBe(0);
  });
});
