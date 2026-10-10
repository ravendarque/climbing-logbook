import { env } from "cloudflare:workers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TRACKING_PARAMS, withoutTrackingParams } from "../shared/video-links.js";
import { validateEntryShape } from "../shared/entry-schema.js";

const VALID_ENTRY = { id: "e1", placeId: "p1", name: "Route", grade: "6B", type: "boulder", status: "send" };
import { createAuthedSession, jsonRequest, resetAuthTables, seedPlace } from "./support.js";

describe("withoutTrackingParams (#1328)", () => {
  for (const param of [...TRACKING_PARAMS, "utm_source", "utm_campaign"]) {
    it(`removes ${param}`, () => {
      expect(withoutTrackingParams(`https://www.youtube.com/watch?v=abc&${param}=x`)).toBe(
        "https://www.youtube.com/watch?v=abc",
      );
    });
  }

  it("keeps every other parameter, the path and the fragment exactly as written", () => {
    expect(withoutTrackingParams("https://www.youtube.com/watch?v=a%20b&si=xyz&t=1m2s&list=PL1&index=3")).toBe(
      "https://www.youtube.com/watch?v=a%20b&t=1m2s&list=PL1&index=3",
    );
    expect(withoutTrackingParams("https://vimeo.com/123?h=abc&utm_source=x#t=42s")).toBe(
      "https://vimeo.com/123?h=abc#t=42s",
    );
  });

  it("leaves a question mark inside the fragment alone", () => {
    expect(withoutTrackingParams("https://vimeo.com/123#t=1?si=x")).toBe("https://vimeo.com/123#t=1?si=x");
  });

  it("drops the question mark when nothing is left, and leaves a clean link untouched", () => {
    expect(withoutTrackingParams("https://www.instagram.com/reel/AbC/?igsh=xyz")).toBe(
      "https://www.instagram.com/reel/AbC/",
    );
    expect(withoutTrackingParams("https://youtu.be/abc?t=42")).toBe("https://youtu.be/abc?t=42");
    expect(withoutTrackingParams("https://youtu.be/abc")).toBe("https://youtu.be/abc");
  });
});

describe("saving a climb with a tracked video link (#1328)", () => {
  it("checks the length of the link it will store, not the tracked one", () => {
    const tracked = `https://youtu.be/abc?t=42&si=${"x".repeat(400)}`;
    expect(validateEntryShape({ ...VALID_ENTRY, video: tracked })).toBeNull();
  });

  beforeAll(() => {
    env.BETA_GATE_ENABLED = "false";
  });
  afterAll(() => {
    env.BETA_GATE_ENABLED = "true";
  });

  it("stores the link without its tracking parameters", async () => {
    await resetAuthTables();
    const { cookie } = await createAuthedSession();
    const placeId = await seedPlace(cookie);
    const res = await jsonRequest(
      "POST",
      "/-/api/entries",
      {
        name: "Tracked",
        grade: "6B",
        placeId,
        type: "boulder",
        status: "send",
        video: "https://youtu.be/abc?si=TRACKER&t=42",
      },
      { Cookie: cookie },
    );
    expect(res.status).toBe(201);
    const row = await env.LOGBOOK_DB.prepare(`SELECT video FROM entries WHERE name = 'Tracked'`).first();
    expect(row.video).toBe("https://youtu.be/abc?t=42");
  });
});
