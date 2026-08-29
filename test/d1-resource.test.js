// Exercises the two generic extension hooks (afterWrite, decorateRows)
// added for #575 Phase 2's entry-data plan -- entries.js (server/api/
// logbook.js) is their real consumer, but these hooks are table-agnostic
// infrastructure, worth testing against a throwaway table rather than only
// indirectly through entries' own much larger test file.
import { env } from "cloudflare:workers";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createD1ResourceHandlers } from "../server/lib/d1-resource.js";
import { createAuthedSession, resetAuthTables } from "./support.js";

// createAuthedSession's own doc comment requires this -- it signs up
// without an invite code, so the beta gate must be off for the duration
// of this file, same pattern as test/auth.test.js/logbook.test.js/
// map.test.js.
beforeAll(() => { env.BETA_GATE_ENABLED = "false"; });
afterAll(() => { env.BETA_GATE_ENABLED = "true"; });

// "places" already exists as a real D1 table (server/api/places.js's own
// table, migrations/0003_app_data.sql) with a minimal enough shape (id,
// user_id, location_id, area, sync_cursor, created_at, updated_at -- NO
// `name` column; a place is identified by its location + area only) to
// drive through this factory directly without a fixture table of our
// own -- location_id has a NOT NULL FK, so tests seed a real location
// first via the same pattern test/places.test.js already uses.
async function seedLocation(userId) {
  const id = crypto.randomUUID();
  await env.LOGBOOK_DB.prepare("INSERT INTO locations (id, user_id, name, country) VALUES (?, ?, ?, ?)")
    .bind(id, userId, "Fontainebleau", "France").run();
  return id;
}

function buildRow(record, id, userId) {
  return { id, user_id: userId, location_id: record.locationId, area: record.area ?? "" };
}
function rowToJson(row) {
  return { id: row.id, locationId: row.location_id, area: row.area };
}
async function validateFields() { return null; }

let userId;

beforeEach(async () => {
  await resetAuthTables();
  const { userId: id } = await createAuthedSession();
  userId = id;
});

describe("afterWrite", () => {
  it("is called once with (env, id, record) after a fresh insert", async () => {
    const calls = [];
    const { handlePost } = createD1ResourceHandlers({
      table: "places", resourceKey: "places", validateFields, buildRow, rowToJson,
      afterWrite: async (e, id, record) => { calls.push({ id, record }); },
    });
    const locationId = await seedLocation(userId);
    const record = { locationId, area: "Bas Cuvier" };
    const request = new Request("https://x/", { method: "POST", body: JSON.stringify(record) });
    await handlePost(request, env, userId);

    expect(calls).toHaveLength(1);
    expect(calls[0].record).toEqual(record);
    expect(typeof calls[0].id).toBe("string");
  });

  it("is not called when handlePost short-circuits on a validation error", async () => {
    const calls = [];
    const { handlePost } = createD1ResourceHandlers({
      table: "places", resourceKey: "places",
      validateFields: async () => "always invalid",
      buildRow, rowToJson,
      afterWrite: async () => { calls.push(1); },
    });
    const request = new Request("https://x/", { method: "POST", body: JSON.stringify({ area: "x" }) });
    await handlePost(request, env, userId);

    expect(calls).toHaveLength(0);
  });
});

describe("decorateRows", () => {
  it("replaces the list handleGet returns", async () => {
    const { handlePost, handleGet } = createD1ResourceHandlers({
      table: "places", resourceKey: "places", validateFields, buildRow, rowToJson,
      decorateRows: async (e, uid, rows) => rows.map(r => ({ ...r, decorated: true })),
    });
    const locationId = await seedLocation(userId);
    await handlePost(new Request("https://x/", { method: "POST", body: JSON.stringify({ locationId, area: "Bas Cuvier" }) }), env, userId);

    const res = await handleGet(new Request("https://x/"), env, userId);
    const { places } = await res.json();
    expect(places).toHaveLength(1);
    expect(places[0].decorated).toBe(true);
  });

  it("replaces the list handlePost itself returns", async () => {
    const { handlePost } = createD1ResourceHandlers({
      table: "places", resourceKey: "places", validateFields, buildRow, rowToJson,
      decorateRows: async (e, uid, rows) => rows.map(r => ({ ...r, decorated: true })),
    });
    const locationId = await seedLocation(userId);
    const res = await handlePost(new Request("https://x/", { method: "POST", body: JSON.stringify({ locationId, area: "Bas Cuvier" }) }), env, userId);

    const { places } = await res.json();
    expect(places[0].decorated).toBe(true);
  });
});
