import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));
const major = name => Number(pkg.devDependencies[name].match(/\d+/)[0]);

describe("browser requirements (#1458)", () => {
  it("was worked out for the Vite and Tailwind majors in use", () => {
    expect(
      { vite: major("vite"), tailwindcss: major("tailwindcss") },
      "A new major can raise the browser floor: check /help/browser-requirements/ against docs/app-architecture.md (Browser support), then update this",
    ).toEqual({ vite: 8, tailwindcss: 4 });
  });
});
