import { describe, expect, it } from "vitest";
import { demoDataUrl, isDemoUsername } from "../../client/demo-mode.js";
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
    expect(demoDataUrl("beginnerdemo", "/logbook/api/performance/pyramid", "performance/pyramid")).toBe("/logbook/api/public/beginnerdemo/performance/pyramid");
    expect(demoDataUrl("beginnerdemo", "/logbook/api/logbook", "logbook")).toBe("/logbook/api/public/beginnerdemo/logbook");
  });

  it("returns the given session-scoped URL unchanged for a real (non-demo) username", () => {
    expect(demoDataUrl("realuser", "/logbook/api/performance/pyramid", "performance/pyramid")).toBe("/logbook/api/performance/pyramid");
    expect(demoDataUrl("realuser", "/logbook/api/logbook", "logbook")).toBe("/logbook/api/logbook");
  });

  it("DEMO_USERNAMES is derived from DEMO_PERSONAS, not a separately maintained list", () => {
    expect(DEMO_USERNAMES).toEqual(DEMO_PERSONAS.map(p => p.username));
    expect(DEMO_USERNAMES).toHaveLength(3);
  });
});
