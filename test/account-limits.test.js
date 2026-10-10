import { env } from "cloudflare:workers";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ACCOUNT_LIMITS, IMPORTS_PER_DAY, WRITES_PER_MINUTE } from "../shared/account-limits.js";
import { CSV_COLUMNS } from "../shared/csv-import.js";
import { createAuthedSession, fetchJson, jsonRequest, resetAuthTables, seedPlace } from "./support.js";

beforeAll(() => {
  env.BETA_GATE_ENABLED = "false";
});
afterAll(() => {
  env.BETA_GATE_ENABLED = "true";
});

let cookie;
let userId;
beforeEach(async () => {
  await resetAuthTables();
  ({ cookie, userId } = await createAuthedSession());
});

const usage = () => env.LOGBOOK_DB.prepare(`SELECT * FROM account_usage WHERE user_id = ?`).bind(userId).first();
const setUsage = (column, value) =>
  env.LOGBOOK_DB.prepare(
    `INSERT INTO account_usage (user_id, ${column}) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET ${column} = excluded.${column}`,
  )
    .bind(userId, value)
    .run();
const postEntry = (placeId, fields = {}) =>
  jsonRequest(
    "POST",
    "/-/api/entries",
    { name: "Boundary", grade: "6B", placeId, type: "boulder", status: "send", ...fields },
    { Cookie: cookie },
  );

function importCsv(rows) {
  const line = name =>
    CSV_COLUMNS.map(
      col =>
        ({
          name,
          grade: "6B",
          discipline: "boulder",
          status: "send",
          firstAttempt: "false",
          location: "Fontainebleau",
          area: "Bas Cuvier",
          country: "France",
        })[col] ?? "",
    ).join(",");
  return fetchJson("/-/api/entries/import", {
    method: "POST",
    headers: { "Content-Type": "text/csv", Cookie: cookie },
    body: `${[CSV_COLUMNS.join(","), ...rows.map(line)].join("\n")}\n`,
  });
}

describe("stored-row counts (#1045)", () => {
  it("are kept by the database as rows come and go", async () => {
    const placeId = await seedPlace(cookie);
    await postEntry(placeId);
    expect(await usage()).toMatchObject({ entries: 1, places: 1, locations: 1 });

    await env.LOGBOOK_DB.prepare(`DELETE FROM entries WHERE user_id = ?`).bind(userId).run();
    expect((await usage()).entries).toBe(0);
  });
});

describe("the limits on stored rows", () => {
  it("allows the last climb up to the limit and refuses the next, saying what the limit is", async () => {
    const placeId = await seedPlace(cookie);
    await setUsage("entries", ACCOUNT_LIMITS.entries.max - 1);
    expect((await postEntry(placeId)).status).toBe(201);

    const refused = await postEntry(placeId);
    expect(refused.status).toBe(403);
    expect((await refused.json()).error).toBe("Your logbook has reached its limit of 20,000 climbs.");
  });

  it("still accepts a replay of a climb it already has, at the limit", async () => {
    const placeId = await seedPlace(cookie);
    const first = await (await postEntry(placeId, { id: "replayed-entry" })).json();
    await setUsage("entries", ACCOUNT_LIMITS.entries.max);
    const replay = await postEntry(placeId, { id: "replayed-entry" });
    expect(replay.status).toBe(200);
    expect((await replay.json()).entry.id).toBe(first.entry.id);
  });

  it("limits places and locations the same way", async () => {
    await seedPlace(cookie);
    await setUsage("locations", ACCOUNT_LIMITS.locations.max);
    const location = await jsonRequest(
      "POST",
      "/-/api/locations",
      { name: "Another crag", country: "France" },
      {
        Cookie: cookie,
      },
    );
    expect(location.status).toBe(403);
    expect((await location.json()).error).toBe("Your logbook has reached its limit of 2,000 locations.");

    await setUsage("places", ACCOUNT_LIMITS.places.max);
    const { results } = await env.LOGBOOK_DB.prepare(`SELECT id FROM locations WHERE user_id = ?`).bind(userId).all();
    const place = await jsonRequest(
      "POST",
      "/-/api/places",
      { locationId: results[0].id, area: "New sector" },
      {
        Cookie: cookie,
      },
    );
    expect(place.status).toBe(403);
    expect((await place.json()).error).toBe("Your logbook has reached its limit of 5,000 places.");
  });

  it("refuses an import that would cross a limit, and saves none of it", async () => {
    await setUsage("entries", ACCOUNT_LIMITS.entries.max - 1);
    const res = await importCsv(["One", "Two"]);
    expect(res.status).toBe(403);
    const { n } = await env.LOGBOOK_DB.prepare(`SELECT count(*) AS n FROM entries WHERE user_id = ?`)
      .bind(userId)
      .first();
    expect(n).toBe(0);
  });
});

describe("the import limit", () => {
  it(`allows ${IMPORTS_PER_DAY} imports a day and refuses the next`, async () => {
    for (let i = 0; i < IMPORTS_PER_DAY; i++) expect((await importCsv([`Climb ${i}`])).status).toBe(201);
    const refused = await importCsv(["One too many"]);
    expect(refused.status).toBe(429);
    expect((await refused.json()).error).toBe("You can import up to 10 files a day. Try again tomorrow.");
  });
});

describe("the save rate", () => {
  it(`lets an offline queue of ${WRITES_PER_MINUTE} saves through in a minute, then asks the next to wait`, async () => {
    env.RATE_LIMITING_ENABLED = "true";
    // The local limiter counts in wall-clock minutes, so every save has to land in one (#1326).
    const leftInWindowMs = 60_000 - (Date.now() % 60_000);
    if (leftInWindowMs < 15_000) await new Promise(resolve => setTimeout(resolve, leftInWindowMs + 100));
    try {
      const statuses = [];
      for (let i = 0; i <= WRITES_PER_MINUTE; i++) {
        statuses.push(
          (await jsonRequest("PATCH", "/-/api/settings", { athleteMode: i % 2 === 0 }, { Cookie: cookie })).status,
        );
      }
      expect(statuses.slice(0, WRITES_PER_MINUTE)).not.toContain(429);
      expect(statuses[WRITES_PER_MINUTE]).toBe(429);
      expect((await jsonRequest("GET", "/-/api/settings", undefined, { Cookie: cookie })).status).toBe(200);
    } finally {
      env.RATE_LIMITING_ENABLED = "false";
    }
  }, 60_000);
});
