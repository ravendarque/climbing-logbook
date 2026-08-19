// Exercises src/api/logbook-import.js through the real Worker entrypoint
// (real routing + real D1 binding), same "public HTTP contract" reasoning
// as test/logbook.test.js -- a CSV body rather than JSON is the one real
// difference from that file's own request-building.
import { env } from "cloudflare:workers";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { CSV_COLUMNS } from "../shared/csv-import.js";
import { createAuthedSession, fetchJson, resetAuthTables } from "./support.js";

const IMPORT_URL = "/logbook/api/admin/logbook/import";
const HEADER = CSV_COLUMNS.join(",");

beforeAll(() => { env.BETA_GATE_ENABLED = "false"; });
afterAll(() => { env.BETA_GATE_ENABLED = "true"; });

let cookie;

beforeEach(async () => {
  await resetAuthTables();
  ({ cookie } = await createAuthedSession());
});

function csvRow(overrides = {}) {
  const values = {
    name: "La Marie-Rose", grade: "6B", discipline: "boulder", status: "send",
    firstAttempt: "true", date: "2026-07-30", location: "Fontainebleau",
    area: "Bas Cuvier", country: "France", video: "", notes: "",
    ...overrides,
  };
  return CSV_COLUMNS.map(col => values[col]).join(",");
}

function importCsv(rows, extraCookie = cookie) {
  const body = [HEADER, ...rows].join("\n") + "\n";
  return fetchJson(IMPORT_URL, {
    method: "POST",
    headers: { "Content-Type": "text/csv", Cookie: extraCookie },
    body,
  });
}

describe("handleImport", () => {
  it("rejects an unauthenticated request", async () => {
    const res = await fetchJson(IMPORT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/csv" },
      body: `${HEADER}\n${csvRow()}\n`,
    });
    expect(res.status).toBe(401);
  });

  it("rejects an empty body", async () => {
    const res = await fetchJson(IMPORT_URL, { method: "POST", headers: { Cookie: cookie }, body: "" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("CSV file is empty.");
  });

  it("rejects a header that doesn't match the template", async () => {
    const res = await fetchJson(IMPORT_URL, { method: "POST", headers: { Cookie: cookie }, body: "name,grade\nFoo,6A\n" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/^CSV header doesn't match the template/);
  });

  it("imports valid rows, minting a new location and place", async () => {
    const res = await importCsv([csvRow()]);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.imported).toBe(1);
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0]).toMatchObject({ name: "La Marie-Rose", grade: "6B", type: "boulder", status: "send" });

    const locations = await (await fetchJson("/logbook/api/locations", { headers: { Cookie: cookie } })).json();
    expect(locations.locations).toEqual([expect.objectContaining({ name: "Fontainebleau", country: "France" })]);
    const places = await (await fetchJson("/logbook/api/places", { headers: { Cookie: cookie } })).json();
    expect(places.places).toEqual([expect.objectContaining({ area: "Bas Cuvier" })]);
  });

  it("dedups repeated location+area pairs within one import into a single place", async () => {
    const res = await importCsv([csvRow({ name: "Route A" }), csvRow({ name: "Route B" })]);
    expect(res.status).toBe(201);
    const { entries } = await res.json();
    expect(entries[0].placeId).toBe(entries[1].placeId);

    const places = await (await fetchJson("/logbook/api/places", { headers: { Cookie: cookie } })).json();
    expect(places.places).toHaveLength(1);
  });

  it("matches an existing location case-insensitively instead of creating a duplicate", async () => {
    await importCsv([csvRow()]);
    const res = await importCsv([csvRow({ name: "Second Route", location: "fontainebleau", area: "bas cuvier" })]);
    expect(res.status).toBe(201);

    const locations = await (await fetchJson("/logbook/api/locations", { headers: { Cookie: cookie } })).json();
    expect(locations.locations).toHaveLength(1);
    const places = await (await fetchJson("/logbook/api/places", { headers: { Cookie: cookie } })).json();
    expect(places.places).toHaveLength(1);
  });

  it("reports the CSV line number and a location-worded message for a missing location", async () => {
    const res = await importCsv([csvRow(), csvRow({ location: "" })]);
    expect(res.status).toBe(400);
    expect((await res.json()).errors).toEqual([{ row: 3, error: "Missing required field: location" }]);
  });

  it("reports a discipline-worded message for an invalid discipline", async () => {
    const res = await importCsv([csvRow({ discipline: "sport" })]);
    expect(res.status).toBe(400);
    const { errors } = await res.json();
    expect(errors[0].error).toMatch(/^discipline must be one of/);
  });

  it("reports every invalid row, not just the first", async () => {
    const res = await importCsv([csvRow({ grade: "6a" }), csvRow({ status: "flashed" })]);
    expect(res.status).toBe(400);
    const { errors } = await res.json();
    expect(errors).toEqual([
      { row: 2, error: expect.stringMatching(/^grade must be one of/) },
      { row: 3, error: expect.stringMatching(/^status must be one of/) },
    ]);
  });

  it("writes nothing when any row is invalid (all-or-nothing)", async () => {
    const res = await importCsv([csvRow(), csvRow({ grade: "6a" })]);
    expect(res.status).toBe(400);

    const entries = await (await fetchJson("/logbook/api/logbook", { headers: { Cookie: cookie } })).json();
    expect(entries.entries).toEqual([]);
    const locations = await (await fetchJson("/logbook/api/locations", { headers: { Cookie: cookie } })).json();
    expect(locations.locations).toEqual([]);
  });

  it("coerces the firstAttempt CSV string correctly, not by string truthiness", async () => {
    const res = await importCsv([csvRow({ firstAttempt: "false" })]);
    expect(res.status).toBe(201);
    const { entries } = await res.json();
    expect(entries[0].firstAttempt).toBe(false);
  });

  it("a second user's import never sees or reuses the first user's locations", async () => {
    await importCsv([csvRow()]);
    const userB = await createAuthedSession();
    const res = await importCsv([csvRow({ name: "Other user's route" })], userB.cookie);
    expect(res.status).toBe(201);

    const locations = await (await fetchJson("/logbook/api/locations", { headers: { Cookie: userB.cookie } })).json();
    expect(locations.locations).toHaveLength(1);
  });
});
