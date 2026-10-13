import { describe, expect, it } from "vitest";
import { PAIN_INJURY, PAIN_INJURY_HISTORY, painInjuryConsentUpdate } from "../../shared/health-consent.js";

describe("painInjuryConsentUpdate (#1121)", () => {
  it("is null without a grant, and for a grant of the current wording", () => {
    expect(painInjuryConsentUpdate(null)).toBeNull();
    expect(painInjuryConsentUpdate(PAIN_INJURY.version)).toBeNull();
  });

  it("asks again when newer wording needs consent again, listing what changed", () => {
    expect(painInjuryConsentUpdate("2000-01-01")).toEqual({
      version: PAIN_INJURY.version,
      required: true,
      changes: PAIN_INJURY_HISTORY.flatMap(({ changes }) => changes),
    });
  });

  it("names the age rule and the health data in the statement", () => {
    const { statement } = PAIN_INJURY_HISTORY.at(-1);
    expect(statement).toContain("I'm 16 or over, or my parent or guardian agrees to this.");
    expect(statement).toContain("pain and injury information");
  });
});
