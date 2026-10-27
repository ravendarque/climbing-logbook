import { describe, expect, it } from "vitest";
import { VOCABULARY_VERSION } from "../server/lib/hardest-beta.js";

describe("VOCABULARY_VERSION (#1523)", () => {
  it("is the exact pinned version of the beta interpreter, so a range can't hide which one read a movement", () => {
    expect(VOCABULARY_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
