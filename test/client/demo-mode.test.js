import { describe, expect, it } from "vitest";
import { isDemoUsername, performanceDataUrl } from "../../client/demo-mode.js";
import { DEMO_PERSONAS, DEMO_USERNAMES } from "../../shared/demo-personas.js";

describe("demo-mode", () => {
  it("recognizes exactly the three reserved demo usernames", () => {
    expect(isDemoUsername("beginnerdemo")).toBe(true);
    expect(isDemoUsername("intermediatedemo")).toBe(true);
    expect(isDemoUsername("advanceddemo")).toBe(true);
    expect(isDemoUsername("someone-else")).toBe(false);
    expect(isDemoUsername("")).toBe(false);
  });

  it("builds the public, target-user-scoped URL for a demo username", () => {
    expect(performanceDataUrl("beginnerdemo", "pyramid")).toBe("/logbook/api/public/beginnerdemo/performance/pyramid");
  });

  it("builds the plain session-scoped URL for a real (non-demo) username", () => {
    expect(performanceDataUrl("realuser", "pyramid")).toBe("/logbook/api/performance/pyramid");
  });

  it("DEMO_USERNAMES is derived from DEMO_PERSONAS, not a separately maintained list", () => {
    expect(DEMO_USERNAMES).toEqual(DEMO_PERSONAS.map(p => p.username));
    expect(DEMO_USERNAMES).toHaveLength(3);
  });
});
