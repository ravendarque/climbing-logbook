import { env } from "cloudflare:workers";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { BODY_LIMITS, FIELD_LIMITS } from "../shared/field-limits.js";
import { ACCOUNT_LIMITS } from "../shared/account-limits.js";
import { CSV_COLUMNS } from "../shared/csv-import.js";
import { createAuthedSession, fetchJson, jsonRequest, resetAuthTables, seedPlace } from "./support.js";

beforeAll(() => {
  env.BETA_GATE_ENABLED = "false";
});
afterAll(() => {
  env.BETA_GATE_ENABLED = "true";
});

let cookie;
beforeEach(async () => {
  await resetAuthTables();
  ({ cookie } = await createAuthedSession());
});
afterEach(() => vi.unstubAllGlobals());

const text = n => "x".repeat(n);
const MOVE = { limb: "hand", side: "left", holdType: "crimp", movementStyle: "static", wallAngle: "vert" };
const videoOf = length => {
  const base = "https://www.youtube.com/watch?v=abc&t=";
  return base + "1".repeat(length - base.length);
};

async function postEntry(fields) {
  const placeId = await seedPlace(cookie);
  return jsonRequest(
    "POST",
    "/-/api/entries",
    { name: "Boundary", grade: "6B", placeId, type: "boulder", status: "send", ...fields },
    { Cookie: cookie },
  );
}

function importCsv(row) {
  const values = {
    name: "Boundary",
    grade: "6B",
    discipline: "boulder",
    status: "send",
    firstAttempt: "false",
    location: "Fontainebleau",
    area: "Bas Cuvier",
    country: "France",
    ...row,
  };
  const line = CSV_COLUMNS.map(col => JSON.stringify(values[col] ?? "")).join(",");
  return fetchJson("/-/api/entries/import", {
    method: "POST",
    headers: { "Content-Type": "text/csv", Cookie: cookie },
    body: `${CSV_COLUMNS.join(",")}\n${line}\n`,
  });
}

describe("climb fields (#1044)", () => {
  const cases = [
    ["name", text, FIELD_LIMITS.entryName, "Name can be up to 80 characters."],
    ["notes", text, FIELD_LIMITS.notes, "Notes can be up to 5,000 characters."],
    ["video", videoOf, FIELD_LIMITS.video, "The video link can be up to 300 characters."],
  ];
  for (const [field, make, limit, message] of cases) {
    it(`takes ${field} at ${limit} characters and refuses one more, saving or importing`, async () => {
      expect((await postEntry({ [field]: make(limit) })).status).toBe(201);

      const over = await postEntry({ [field]: make(limit + 1) });
      expect(over.status).toBe(400);
      expect((await over.json()).error).toBe(message);

      const imported = await importCsv({ [field]: make(limit + 1) });
      expect(imported.status).toBe(400);
      expect((await imported.json()).errors[0].error).toBe(message);
    });
  }

  for (const [field, message] of [
    ["moves", "Add up to 20 moves."],
    ["painMoves", "Add up to 20 painful moves."],
  ]) {
    it(`takes ${field} with 20 rows and refuses 21`, async () => {
      const rows = n => Array.from({ length: n }, () => ({ ...MOVE, difficulty: "hardest" }));
      const rowsFor = n => (field === "moves" ? rows(n) : rows(n).map(({ difficulty, ...row }) => row));
      expect((await postEntry({ [field]: rowsFor(20) })).status).toBe(201);
      const over = await postEntry({ [field]: rowsFor(21) });
      expect(over.status).toBe(400);
      expect((await over.json()).error).toBe(message);
    });
  }
});

describe("locations and areas (#1044)", () => {
  it("takes a location name of 50 characters and refuses 51, by API and by import", async () => {
    const ok = await jsonRequest("POST", "/-/api/locations", { name: text(50) }, { Cookie: cookie });
    expect(ok.status).toBe(201);
    const over = await jsonRequest("POST", "/-/api/locations", { name: text(51) }, { Cookie: cookie });
    expect(over.status).toBe(400);
    expect((await over.json()).error).toBe("Location name can be up to 50 characters.");

    const imported = await importCsv({ location: text(51) });
    expect((await imported.json()).errors[0].error).toBe("Location name can be up to 50 characters.");
  });

  it("takes an area of 50 characters and refuses 51, by API and by import", async () => {
    const loc = await (await jsonRequest("POST", "/-/api/locations", { name: "Crag" }, { Cookie: cookie })).json();
    const post = area =>
      jsonRequest("POST", "/-/api/places", { locationId: loc.location.id, area }, { Cookie: cookie });
    expect((await post(text(50))).status).toBe(201);
    const over = await post(text(51));
    expect(over.status).toBe(400);
    expect((await over.json()).error).toBe("Area can be up to 50 characters.");

    const imported = await importCsv({ area: text(51) });
    expect((await imported.json()).errors[0].error).toBe("Area can be up to 50 characters.");
  });

  it("takes a country only from the list, and an import's country in any case", async () => {
    const post = country => jsonRequest("POST", "/-/api/locations", { name: country, country }, { Cookie: cookie });
    expect((await post("France")).status).toBe(201);
    const made = await post("Narnia");
    expect(made.status).toBe(400);
    expect((await made.json()).error).toBe("Choose a country from the list.");

    expect((await importCsv({ location: "Ceuse", country: "france" })).status).toBe(201);
    const stored = await env.LOGBOOK_DB.prepare(`SELECT country FROM locations WHERE name = 'Ceuse'`).first();
    expect(stored.country).toBe("France");
    expect((await (await importCsv({ country: "Narnia" })).json()).errors[0].error).toBe(
      "Choose a country from the list.",
    );
  });
});

describe("reports and feedback (#1044)", () => {
  beforeEach(async () => {
    await env.LOGBOOK_DB.prepare(`DELETE FROM issue_reports`).run();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200 })),
    );
  });
  const report = body =>
    jsonRequest("POST", "/-/api/report-issue", { message: "It broke.", turnstileToken: "t", ...body });

  it("takes a message of 5,000 characters and refuses one more", async () => {
    expect((await report({ message: text(5000) })).status).toBe(201);
    const over = await report({ message: text(5001) });
    expect(over.status).toBe(400);
    expect((await over.json()).error).toBe("Your message can be up to 5,000 characters.");
  });

  it("takes a blank or valid contact email, and refuses anything else", async () => {
    expect((await report({ contactEmail: "" })).status).toBe(201);
    expect((await report({ contactEmail: "me@example.com" })).status).toBe(201);
    const bad = await report({ contactEmail: "not an email" });
    expect((await bad.json()).error).toBe("Enter a valid email address, or leave it blank.");
    const long = await report({ contactEmail: `${text(250)}@x.co` });
    expect((await long.json()).error).toBe("The email address can be up to 254 characters.");
  });

  it("keeps a source page on our own site and drops any other", async () => {
    await report({ message: "ours", sourcePage: "https://my.climbinglogbook.com/nix/log" });
    await report({ message: "theirs", sourcePage: "https://www.google.com/" });
    const { results } = await env.LOGBOOK_DB.prepare(
      `SELECT message, source_page FROM issue_reports ORDER BY message`,
    ).all();
    expect(results).toEqual([
      { message: "ours", source_page: "https://my.climbinglogbook.com/nix/log" },
      { message: "theirs", source_page: null },
    ]);
  });
});

describe("request bodies (#1044)", () => {
  const oversized = "x".repeat(BODY_LIMITS.json + 1);

  it("refuses a body over 256 KB from its Content-Length, before reading it", async () => {
    const res = await fetchJson("/-/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "Content-Length": String(oversized.length), Cookie: cookie },
      body: oversized,
    });
    expect(res.status).toBe(413);
  });

  it("refuses a body over 256 KB that doesn't say its length", async () => {
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(oversized));
        controller.close();
      },
    });
    const res = await fetchJson("/-/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body,
      duplex: "half",
    });
    expect(res.status).toBe(413);
  });

  it("lets an import through up to 2 MB, and refuses more", async () => {
    const big = await fetchJson("/-/api/entries/import", {
      method: "POST",
      headers: { "Content-Type": "text/csv", Cookie: cookie },
      body: "x".repeat(BODY_LIMITS.json + 1),
    });
    expect(big.status).toBe(400);

    const tooBig = await fetchJson("/-/api/entries/import", {
      method: "POST",
      headers: { "Content-Type": "text/csv", Cookie: cookie },
      body: "x".repeat(BODY_LIMITS.import + 1),
    });
    expect(tooBig.status).toBe(413);
  });
});

describe("paging (#1044)", () => {
  it("refuses an offset past the most climbs an account can hold", async () => {
    const placeId = await seedPlace(cookie);
    const locationId = (
      await env.LOGBOOK_DB.prepare(`SELECT location_id FROM places WHERE id = ?`).bind(placeId).first()
    ).location_id;
    const at = offset =>
      fetchJson(`/-/api/entries?locationId=${locationId}&offset=${offset}`, { headers: { Cookie: cookie } });
    expect((await at(ACCOUNT_LIMITS.entries.max)).status).toBe(200);
    expect((await at(ACCOUNT_LIMITS.entries.max + 1)).status).toBe(400);
  });
});
