import { env } from "cloudflare:workers";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { CSV_COLUMNS } from "../shared/csv-import.js";
import { createAuthedSession, fetchJson, resetAuthTables } from "./support.js";

const IMPORT_URL = "/-/api/entries/import";
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
    area: "Bas Cuvier", country: "France", video: "", notes: "", sportStyle: "",
    attemptsToSend: "", rpe: "", gradeScale: "",
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

  it("rejects a file with more than 500 rows", async () => {
    const rows = Array.from({ length: 501 }, () => csvRow());
    const res = await importCsv(rows);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Import is limited to 500 rows per file (this file has 501).");
  });

  it("accepts exactly 500 rows", async () => {
    const rows = Array.from({ length: 500 }, () => csvRow());
    const res = await importCsv(rows);
    expect(res.status).toBe(201);
    expect((await res.json()).imported).toBe(500);
  });

  it("imports valid rows, minting a new location and place", async () => {
    const res = await importCsv([csvRow()]);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.imported).toBe(1);
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0]).toMatchObject({ name: "La Marie-Rose", grade: "6B", type: "boulder", status: "send" });

    const locations = await (await fetchJson("/-/api/locations", { headers: { Cookie: cookie } })).json();
    expect(locations.locations).toEqual([expect.objectContaining({ name: "Fontainebleau", country: "France" })]);
    const places = await (await fetchJson("/-/api/places", { headers: { Cookie: cookie } })).json();
    expect(places.places).toEqual([expect.objectContaining({ area: "Bas Cuvier" })]);
  });

  it("dedups repeated location+area pairs within one import into a single place", async () => {
    const res = await importCsv([csvRow({ name: "Route A" }), csvRow({ name: "Route B" })]);
    expect(res.status).toBe(201);
    const { entries } = await res.json();
    expect(entries[0].placeId).toBe(entries[1].placeId);

    const places = await (await fetchJson("/-/api/places", { headers: { Cookie: cookie } })).json();
    expect(places.places).toHaveLength(1);
  });

  it("matches an existing location case-insensitively instead of creating a duplicate", async () => {
    await importCsv([csvRow()]);
    const res = await importCsv([csvRow({ name: "Second Route", location: "fontainebleau", area: "bas cuvier" })]);
    expect(res.status).toBe(201);

    const locations = await (await fetchJson("/-/api/locations", { headers: { Cookie: cookie } })).json();
    expect(locations.locations).toHaveLength(1);
    const places = await (await fetchJson("/-/api/places", { headers: { Cookie: cookie } })).json();
    expect(places.places).toHaveLength(1);
  });

  it("reports the CSV line number and a location-worded message for a missing location", async () => {
    const res = await importCsv([csvRow(), csvRow({ location: "" })]);
    expect(res.status).toBe(400);
    expect((await res.json()).errors).toEqual([{ row: 3, error: "Missing required field: location" }]);
  });

  it("reports a discipline-worded message for an invalid discipline", async () => {
    const res = await importCsv([csvRow({ discipline: "trad" })]);
    expect(res.status).toBe(400);
    const { errors } = await res.json();
    expect(errors[0].error).toMatch(/^discipline must be one of/);
  });

  it("reports every invalid row, not just the first", async () => {
    const res = await importCsv([csvRow({ grade: "VI+" }), csvRow({ status: "flashed" })]);
    expect(res.status).toBe(400);
    const { errors } = await res.json();
    expect(errors).toEqual([
      { row: 2, error: expect.stringMatching(/^grade is not a valid grade for/) },
      { row: 3, error: expect.stringMatching(/^status must be one of/) },
    ]);
  });

  it("writes nothing when any row is invalid (all-or-nothing)", async () => {
    const res = await importCsv([csvRow(), csvRow({ grade: "VI+" })]);
    expect(res.status).toBe(400);

    const entries = await (await fetchJson("/-/api/entries", { headers: { Cookie: cookie } })).json();
    expect(entries.entries).toEqual([]);
    const locations = await (await fetchJson("/-/api/locations", { headers: { Cookie: cookie } })).json();
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

    const locations = await (await fetchJson("/-/api/locations", { headers: { Cookie: userB.cookie } })).json();
    expect(locations.locations).toHaveLength(1);
  });

  it("imports a Sport row with its sportStyle column, requiring it same as the single-entry form (#643)", async () => {
    const res = await importCsv([csvRow({ discipline: "sport", grade: "6a", sportStyle: "lead" })]);
    expect(res.status).toBe(201);
    const { entries } = await res.json();
    expect(entries[0]).toMatchObject({ type: "sport", sportStyle: "lead" });
  });

  it("rejects a Sport row with no sportStyle, same required-field message as the single-entry form", async () => {
    const res = await importCsv([csvRow({ discipline: "sport", grade: "6a", sportStyle: "" })]);
    expect(res.status).toBe(400);
    expect((await res.json()).errors).toEqual([{ row: 2, error: "Missing required field: sportStyle" }]);
  });

  it("imports attemptsToSend/rpe/gradeScale when given", async () => {
    const res = await importCsv([csvRow({ attemptsToSend: "3", rpe: "80", gradeScale: "font-non-standard" })]);
    expect(res.status).toBe(201);
    const { entries } = await res.json();
    expect(entries[0]).toMatchObject({ attemptsToSend: 3, rpe: 80, gradeScale: "font-non-standard" });
  });

  it("falls back to defaultGradeScale() when the gradeScale column is blank, same as the single-entry form", async () => {
    const res = await importCsv([csvRow({ discipline: "boulder", grade: "6B", gradeScale: "" })]);
    expect(res.status).toBe(201);
    const { entries } = await res.json();
    expect(entries[0].gradeScale).toBe("font-non-standard");
  });

  it("rejects an rpe value that isn't a multiple of 10, same message as the single-entry form", async () => {
    const res = await importCsv([csvRow({ rpe: "85" })]);
    expect(res.status).toBe(400);
    expect((await res.json()).errors).toEqual([{ row: 2, error: "rpe must be a multiple of 10 between 0 and 100" }]);
  });

  it("rejects a gradeScale that doesn't belong to the row's discipline", async () => {
    const res = await importCsv([csvRow({ discipline: "boulder", grade: "6B", gradeScale: "french" })]);
    expect(res.status).toBe(400);
    expect((await res.json()).errors[0].error).toMatch(/^gradeScale must be one of/);
  });
});

function jsonEntry(overrides = {}) {
  return {
    name: "La Marie-Rose", grade: "6B", discipline: "boulder", status: "send",
    firstAttempt: true, date: "2026-07-30", location: "Fontainebleau",
    area: "Bas Cuvier", country: "France", video: "", notes: "",
    ...overrides,
  };
}

function importJson(entries, extraCookie = cookie) {
  return fetchJson(IMPORT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: extraCookie },
    body: JSON.stringify(entries),
  });
}

describe("handleImport (JSON, #639)", () => {
  it("rejects invalid JSON", async () => {
    const res = await fetchJson(IMPORT_URL, { method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: "not json" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("JSON file isn't valid JSON.");
  });

  it("rejects an empty array", async () => {
    const res = await importJson([]);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("JSON file has no entries to import.");
  });

  it("imports valid entries, minting a new location and place, same as the CSV path", async () => {
    const res = await importJson([jsonEntry()]);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.imported).toBe(1);
    expect(body.entries[0]).toMatchObject({ name: "La Marie-Rose", grade: "6B", type: "boulder", status: "send" });

    const locations = await (await fetchJson("/-/api/locations", { headers: { Cookie: cookie } })).json();
    expect(locations.locations).toEqual([expect.objectContaining({ name: "Fontainebleau", country: "France" })]);
  });

  it("reports entry-numbered (not CSV line-numbered) errors -- a JSON array has no header row", async () => {
    const res = await importJson([jsonEntry(), jsonEntry({ location: "" })]);
    expect(res.status).toBe(400);
    expect((await res.json()).errors).toEqual([{ row: 2, error: "Missing required field: location" }]);
  });

  it("normalizes a real JSON boolean firstAttempt correctly, not by string truthiness", async () => {
    const res = await importJson([jsonEntry({ firstAttempt: false })]);
    expect(res.status).toBe(201);
    const { entries } = await res.json();
    expect(entries[0].firstAttempt).toBe(false);
  });

  it("writes nothing when any entry is invalid (all-or-nothing, same as CSV)", async () => {
    const res = await importJson([jsonEntry(), jsonEntry({ grade: "VI+" })]);
    expect(res.status).toBe(400);
    const entries = await (await fetchJson("/-/api/entries", { headers: { Cookie: cookie } })).json();
    expect(entries.entries).toEqual([]);
  });

  it("round-trips this app's own JSON export shape end-to-end", async () => {
    const exportedShape = {
      name: "Redpoint Route", grade: "6a", discipline: "sport", status: "send",
      firstAttempt: true, date: "2026-08-01", location: "Kalymnos",
      area: "Grande Grotta", country: "Greece", video: "", notes: "", sportStyle: "lead",
    };
    const res = await importJson([exportedShape]);
    expect(res.status).toBe(201);
    const { entries } = await res.json();
    expect(entries[0]).toMatchObject({ name: "Redpoint Route", grade: "6a", type: "sport", status: "send", firstAttempt: true, sportStyle: "lead" });
  });

  it("imports a Sport entry, requiring sportStyle same as the single-entry form (#643)", async () => {
    const res = await importJson([jsonEntry({ discipline: "sport", grade: "6a", sportStyle: "top_rope" })]);
    expect(res.status).toBe(201);
    const { entries } = await res.json();
    expect(entries[0]).toMatchObject({ type: "sport", sportStyle: "top_rope" });
  });

  it("rejects a Sport entry with no sportStyle, same required-field message as the single-entry form", async () => {
    const res = await importJson([jsonEntry({ discipline: "sport", grade: "6a" })]);
    expect(res.status).toBe(400);
    expect((await res.json()).errors).toEqual([{ row: 1, error: "Missing required field: sportStyle" }]);
  });

  it("imports attemptsToSend/rpe/gradeScale when given", async () => {
    const res = await importJson([jsonEntry({ attemptsToSend: 3, rpe: 80, gradeScale: "font-non-standard" })]);
    expect(res.status).toBe(201);
    const { entries } = await res.json();
    expect(entries[0]).toMatchObject({ attemptsToSend: 3, rpe: 80, gradeScale: "font-non-standard" });
  });

  it("falls back to defaultGradeScale() when gradeScale is omitted, same as the single-entry form", async () => {
    const res = await importJson([jsonEntry()]);
    expect(res.status).toBe(201);
    const { entries } = await res.json();
    expect(entries[0].gradeScale).toBe("font-non-standard");
  });
});
