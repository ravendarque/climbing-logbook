import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CLIENT_ENTRIES } from "../../vite.entries.mjs";

// Vitest runs from the repo root (happy-dom's import.meta.url isn't a file URL).
const headers = readFileSync(join(process.cwd(), "static/_headers"), "utf8");

describe("static/_headers", () => {
  it("marks exactly the built page bundles immutable, no more and no fewer", () => {
    const listed = [...headers.matchAll(/^\/-\/([\w-]+)-app\.js$/gm)].map(match => match[1]);
    expect(listed.toSorted()).toEqual(Object.keys(CLIENT_ENTRIES).toSorted());
  });
});
