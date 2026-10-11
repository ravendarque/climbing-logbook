import { env, exports } from "cloudflare:workers";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createPublicSession,
  jsonRequest,
  resetAuthTables,
  seedPlace,
  startInFreshRateLimitWindow,
} from "./support.js";

beforeAll(() => {
  env.BETA_GATE_ENABLED = "false";
});
afterAll(() => {
  env.BETA_GATE_ENABLED = "true";
});
beforeEach(resetAuthTables);

const fetchPublic = (username, resource, headers = {}) =>
  exports.default.fetch(`https://example.com/-/api/public/${username}/${resource}`, { headers });

async function publicLogbookWithOneClimb(username) {
  const session = await createPublicSession({ username });
  const placeId = await seedPlace(session.cookie);
  const climb = n =>
    jsonRequest(
      "POST",
      "/-/api/entries",
      { placeId, name: `Climb ${n}`, grade: "6B", type: "boulder", status: "send" },
      { Cookie: session.cookie },
    );
  await climb(1);
  return { ...session, climb };
}

describe("public reads at the edge (#1059)", () => {
  it("serves a repeat read from the cache, and never lets a browser keep it", async () => {
    await publicLogbookWithOneClimb("cacheduser");
    const first = await fetchPublic("cacheduser", "entries");
    const second = await fetchPublic("cacheduser", "entries");

    expect(first.headers.get("X-Public-Cache")).toBe("MISS");
    expect(second.headers.get("X-Public-Cache")).toBe("HIT");
    expect(second.headers.get("Cache-Control")).toBe("no-store");
    expect(await second.json()).toEqual(await first.json());
  });

  it("ignores query parameters the handlers don't read, so they can't force a miss", async () => {
    await publicLogbookWithOneClimb("junkparams");
    await fetchPublic("junkparams", "entries?limit=100");
    const junk = await fetchPublic("junkparams", "entries?limit=100&x=random1");
    expect(junk.headers.get("X-Public-Cache")).toBe("HIT");
    const different = await fetchPublic("junkparams", "entries?limit=50");
    expect(different.headers.get("X-Public-Cache")).toBe("MISS");
  });

  it("shows an owner's change straight away", async () => {
    const { climb } = await publicLogbookWithOneClimb("changinguser");
    await fetchPublic("changinguser", "entries");
    await climb(2);

    const after = await fetchPublic("changinguser", "entries");
    expect(after.headers.get("X-Public-Cache")).toBe("MISS");
    expect((await after.json()).entries).toHaveLength(2);
  });

  it("stops serving the moment the logbook is made private, cached or not", async () => {
    const { userId } = await publicLogbookWithOneClimb("goingprivate");
    await fetchPublic("goingprivate", "entries");
    await fetchPublic("goingprivate", "entries");
    await env.LOGBOOK_DB.prepare(`UPDATE settings SET logbook_public = 0 WHERE user_id = ?`).bind(userId).run();

    expect((await fetchPublic("goingprivate", "entries")).status).toBe(404);
  });

  it("answers a private logbook and an unknown one byte for byte the same, headers included", async () => {
    const { userId } = await publicLogbookWithOneClimb("nowprivate");
    await env.LOGBOOK_DB.prepare(`UPDATE settings SET logbook_public = 0 WHERE user_id = ?`).bind(userId).run();
    const privateOne = await fetchPublic("nowprivate", "entries");
    const unknown = await fetchPublic("nobodyhere", "entries");

    expect(privateOne.status).toBe(404);
    expect(await privateOne.text()).toBe(await unknown.text());
    expect([...privateOne.headers]).toEqual([...unknown.headers]);
  });

  it("limits a connection to 60 public reads a minute", async () => {
    await publicLogbookWithOneClimb("busyuser");
    await startInFreshRateLimitWindow();
    env.RATE_LIMITING_ENABLED = "true";
    try {
      const from = { "cf-connecting-ip": "203.0.113.59" };
      for (let i = 0; i < 60; i++) expect((await fetchPublic("busyuser", "entries/counts", from)).status).toBe(200);
      expect((await fetchPublic("busyuser", "entries/counts", from)).status).toBe(429);
    } finally {
      env.RATE_LIMITING_ENABLED = "false";
    }
  }, 60_000);
});
