import { describe, expect, it } from "vitest";
import {
  combinedFlashLabel,
  combinedSendLabel,
  disciplineLabel,
  flashLabel,
  nameLabel,
  sendLabel,
  statusBadge,
} from "../../client/status.js";

describe("flashLabel/sendLabel/nameLabel", () => {
  it("use bouldering terms by default", () => {
    expect(flashLabel()).toBe("Flash");
    expect(sendLabel()).toBe("Send");
    expect(nameLabel()).toBe("Problem name");
  });

  it("use lead terms for the lead discipline", () => {
    expect(flashLabel("lead")).toBe("Onsight");
    expect(sendLabel("lead")).toBe("Redpoint");
    expect(nameLabel("lead")).toBe("Route name");
  });

  it("pluralize when asked", () => {
    expect(flashLabel("boulder", true)).toBe("Flashes");
    expect(sendLabel("lead", true)).toBe("Redpoints");
  });
});

describe("disciplineLabel", () => {
  it("capitalizes each discipline, defaulting to boulder", () => {
    expect(disciplineLabel("boulder")).toBe("Boulder");
    expect(disciplineLabel("lead")).toBe("Lead");
    expect(disciplineLabel()).toBe("Boulder");
  });
});

describe("combinedFlashLabel/combinedSendLabel", () => {
  it("joins each discipline's own wording with a slash", () => {
    expect(combinedFlashLabel(["boulder", "lead"])).toBe("Flash / Onsight");
    expect(combinedSendLabel(["boulder", "lead"])).toBe("Send / Redpoint");
  });

  it("pluralizes when asked", () => {
    expect(combinedFlashLabel(["boulder", "lead"], true)).toBe("Flashes / Onsights");
  });

  it("de-duplicates when disciplines share identical wording", () => {
    expect(combinedFlashLabel(["boulder", "boulder"])).toBe("Flash");
  });

  it("works for a single discipline (no slash)", () => {
    expect(combinedFlashLabel(["lead"])).toBe("Onsight");
  });
});

describe("statusBadge", () => {
  it("shows the flash label and icon for a first-attempt send", () => {
    const html = statusBadge({ status: "send", firstAttempt: true, type: "boulder" });
    expect(html).toContain('title="Flash"');
  });

  it("shows the send label and icon for a non-first-attempt send", () => {
    const html = statusBadge({ status: "send", firstAttempt: false, type: "boulder" });
    expect(html).toContain('title="Send"');
  });

  it("uses discipline-specific labels", () => {
    expect(statusBadge({ status: "send", firstAttempt: true, type: "lead" })).toContain('title="Onsight"');
    expect(statusBadge({ status: "send", firstAttempt: false, type: "lead" })).toContain('title="Redpoint"');
  });

  it("shows Project for a project entry", () => {
    expect(statusBadge({ status: "project" })).toContain('title="Project"');
  });

  it("shows Archived for an abandoned entry", () => {
    expect(statusBadge({ status: "abandoned" })).toContain('title="Archived"');
  });

  it("defaults to Check out for any other status (e.g. wishlist)", () => {
    expect(statusBadge({ status: "wishlist" })).toContain('title="Check out"');
  });
});
