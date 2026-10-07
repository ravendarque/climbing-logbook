import { env } from "cloudflare:workers";
import { afterAll, beforeAll, expect, it } from "vitest";
import { dropOrder } from "../scripts/lib/drop-order.mjs";
import { createAuthedSession, jsonRequest, resetAuthTables, seedPlace } from "./support.js";

beforeAll(() => {
  env.BETA_GATE_ENABLED = "false";
});
afterAll(() => {
  env.BETA_GATE_ENABLED = "true";
});

it("drops every table of the real schema, with data in it, without D1 counting a write (#1291)", async () => {
  await resetAuthTables();
  const { cookie } = await createAuthedSession();
  const placeId = await seedPlace(cookie);
  await jsonRequest(
    "POST",
    "/-/api/entries",
    { name: "Seeded", grade: "6B", placeId, type: "boulder", status: "send" },
    { Cookie: cookie },
  );

  const db = env.LOGBOOK_DB;
  const { results: tables } = await db
    .prepare(
      `SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'`,
    )
    .all();
  const written = {};
  for (const name of dropOrder(tables)) {
    written[name] = (await db.prepare(`DROP TABLE "${name}"`).run()).meta.rows_written;
  }

  expect(
    Object.values(written).every(count => count === 0),
    JSON.stringify(written),
  ).toBe(true);
  const { results: left } = await db
    .prepare(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'`,
    )
    .all();
  expect(left).toEqual([]);
});
