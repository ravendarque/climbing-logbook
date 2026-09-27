import { env } from "cloudflare:workers";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createD1ResourceHandlers } from "../server/lib/d1-resource.js";
import { createAuthedSession, resetAuthTables } from "./support.js";

beforeAll(() => {
  env.BETA_GATE_ENABLED = "false";
});
afterAll(() => {
  env.BETA_GATE_ENABLED = "true";
});

async function seedLocation(userId) {
  const id = crypto.randomUUID();
  await env.LOGBOOK_DB.prepare("INSERT INTO locations (id, user_id, name, country) VALUES (?, ?, ?, ?)")
    .bind(id, userId, "Fontainebleau", "France")
    .run();
  return id;
}

function buildRow(record, id, userId) {
  return { id, user_id: userId, location_id: record.locationId, area: record.area ?? "" };
}
function rowToJson(row) {
  return { id: row.id, locationId: row.location_id, area: row.area };
}
async function validateFields() {
  return null;
}

let userId;

beforeEach(async () => {
  await resetAuthTables();
  const { userId: id } = await createAuthedSession();
  userId = id;
});

function post(handlePost, body) {
  return handlePost(new Request("https://x/", { method: "POST", body: JSON.stringify(body) }), env, userId);
}

describe("childStatements", () => {
  it("run in the same batch as the row, with its id", async () => {
    const { handlePost } = createD1ResourceHandlers({
      table: "places",
      resourceKey: "places",
      rowKey: "place",
      validateFields,
      buildRow,
      rowToJson,
      childStatements: (e, id) => [
        e.LOGBOOK_DB.prepare("UPDATE places SET area = 'Set by child' WHERE id = ?").bind(id),
      ],
    });
    const res = await post(handlePost, { locationId: await seedLocation(userId), area: "Bas Cuvier" });

    expect(res.status).toBe(201);
    expect((await res.json()).place.area).toBe("Set by child");
  });

  it("roll the row back when one of them fails", async () => {
    const { handlePost } = createD1ResourceHandlers({
      table: "places",
      resourceKey: "places",
      rowKey: "place",
      validateFields,
      buildRow,
      rowToJson,
      childStatements: e => [e.LOGBOOK_DB.prepare("INSERT INTO no_such_table (id) VALUES (1)")],
    });
    await expect(
      post(handlePost, { id: "rolled-back", locationId: await seedLocation(userId), area: "Bas Cuvier" }),
    ).rejects.toThrow();

    const row = await env.LOGBOOK_DB.prepare("SELECT id FROM places WHERE id = ?").bind("rolled-back").first();
    expect(row).toBeNull();
  });

  it("aren't built when handlePost short-circuits on a validation error", async () => {
    const calls = [];
    const { handlePost } = createD1ResourceHandlers({
      table: "places",
      resourceKey: "places",
      rowKey: "place",
      validateFields: async () => "always invalid",
      buildRow,
      rowToJson,
      childStatements: () => {
        calls.push(1);
        return [];
      },
    });
    await post(handlePost, { area: "x" });

    expect(calls).toHaveLength(0);
  });
});

describe("decorateRows", () => {
  const decorateRows = async (_e, _uid, rows) => rows.map(r => ({ ...r, decorated: true }));

  it("decorates the list handleGet returns", async () => {
    const { handlePost, handleGet } = createD1ResourceHandlers({
      table: "places",
      resourceKey: "places",
      rowKey: "place",
      validateFields,
      buildRow,
      rowToJson,
      decorateRows,
    });
    await post(handlePost, { locationId: await seedLocation(userId), area: "Bas Cuvier" });

    const { places } = await (await handleGet(new Request("https://x/"), env, userId)).json();
    expect(places).toHaveLength(1);
    expect(places[0].decorated).toBe(true);
  });

  it("decorates the row handlePost returns", async () => {
    const { handlePost } = createD1ResourceHandlers({
      table: "places",
      resourceKey: "places",
      rowKey: "place",
      validateFields,
      buildRow,
      rowToJson,
      decorateRows,
    });
    const res = await post(handlePost, { locationId: await seedLocation(userId), area: "Bas Cuvier" });

    expect((await res.json()).place.decorated).toBe(true);
  });
});
