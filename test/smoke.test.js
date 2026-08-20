// Proves the test harness actually runs against the real Workers runtime
// (Miniflare) with working KV and D1 bindings, not just that Vitest
// itself boots. Real per-handler coverage is #204/#205/#297 -- this is
// infrastructure-only, per #203.
import { it } from "vitest";
import { fetchJson } from "./support.js";

it("returns 404 for an unmatched route", async ({ expect }) => {
  const response = await fetchJson("/nope");
  expect(response.status).toBe(404);
});

// No beforeEach reset here -- safe only because storage isolation is per
// test *file* (Cloudflare's documented behavior for vitest-pool-workers),
// so this file never sees writes made by test/logbook.test.js's POST
// tests. If that isolation granularity ever changes (e.g. a future
// singleWorker config for speed), this assertion would need its own reset.
//
// An anonymous (no session) caller resolves to an empty list rather than
// 401ing (#297) -- there's no single global "the" owner anymore in a
// multi-tenant app, see server/lib/d1-resource.js.
it("reads from the D1-backed public logbook endpoint", async ({ expect }) => {
  const response = await fetchJson("/logbook/api/logbook");
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ entries: [] });
});
