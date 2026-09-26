import { it } from "vitest";
import { fetchJson } from "./support.js";

it("returns 404 for an unmatched route", async ({ expect }) => {
  const response = await fetchJson("/nope");
  expect(response.status).toBe(404);
});

it("routes the D1-backed entries endpoint (401 without a session, #992)", async ({ expect }) => {
  const response = await fetchJson("/-/api/entries");
  expect(response.status).toBe(401);
});
