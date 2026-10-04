// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../client/components/climbing-import.js";

const PANEL = readFileSync("views/_includes/import-panel.njk", "utf8");

let el;

function chooseFile(name, text) {
  const input = el.querySelector("#import-file-input");
  Object.defineProperty(input, "files", { value: [new File([text], name)], configurable: true });
}

function submit() {
  el.querySelector("#import-form").dispatchEvent(new Event("submit", { cancelable: true }));
}

beforeEach(() => {
  const template = document.createElement("template");
  template.innerHTML = PANEL;
  document.body.append(template.content.cloneNode(true));
  el = document.querySelector("climbing-import");
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("ClimbingImport", () => {
  it("fires import-complete with the count after a successful import", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ imported: 3 }), { status: 200 })));
    const complete = new Promise(resolve => el.addEventListener("import-complete", e => resolve(e.detail)));
    chooseFile("log.csv", "name\n");
    submit();

    expect(await complete).toEqual({ imported: 3 });
    expect(el.querySelector("#import-success").hidden).toBe(false);
    expect(el.querySelector("#import-success-message").textContent).toBe("Imported 3 entries.");
  });

  it("lists every row error and fires no import-complete when validation fails", async () => {
    const response = new Response(
      JSON.stringify({
        errors: [
          { row: 2, error: "grade is missing" },
          { row: 5, error: "date is invalid" },
        ],
      }),
      { status: 400 },
    );
    const fetchMock = vi.fn(async () => response);
    vi.stubGlobal("fetch", fetchMock);
    const onComplete = vi.fn();
    el.addEventListener("import-complete", onComplete);
    chooseFile("log.csv", "name\n");
    submit();

    await vi.waitFor(() => expect(el.querySelector("#import-errors").hidden).toBe(false));
    expect([...el.querySelectorAll("#import-errors-list li")].map(li => li.textContent)).toEqual([
      "Row 2: grade is missing",
      "Row 5: date is invalid",
    ]);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("sends a .json file as JSON", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ imported: 1 }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    chooseFile("export.JSON", "[]");
    submit();

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][1].headers["Content-Type"]).toBe("application/json");
  });
});
