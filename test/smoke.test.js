// Proves the test harness actually runs against the real Workers runtime
// (Miniflare) with a working LOGBOOK_KV binding, not just that Vitest
// itself boots. Real per-handler coverage is #204/#205 -- this is
// infrastructure-only, per #203.
import { exports } from "cloudflare:workers";
import { it } from "vitest";

it("returns 404 for an unmatched route", async ({ expect }) => {
  const response = await exports.default.fetch("https://example.com/nope");
  expect(response.status).toBe(404);
});

it("reads from the LOGBOOK_KV binding via the public logbook endpoint", async ({ expect }) => {
  const response = await exports.default.fetch("https://example.com/logbook/api/logbook");
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ entries: [] });
});
