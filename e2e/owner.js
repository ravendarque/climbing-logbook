// Gives each test a signed-in user of its own (provisioned by global-setup.js), seeded through the real API.
import { readFileSync, writeFileSync } from "node:fs";
import { expect, test as base } from "@playwright/test";
import { OWNED_ORIGIN, ownedRouteUrl } from "./owned-route-url.js";

export const OWNER_POOL_PATH = "e2e/.auth/owners.json";
const OWNER_NEXT_PATH = "e2e/.auth/owners-next";
// Raise this when a run runs out: one user per test that uses `owner`.
export const OWNER_POOL_SIZE = 60;

export function ownerPoolUser(i) {
  const username = `e2eowner${String(i).padStart(3, "0")}`;
  return {
    email: `${username}@climbinglogbook.local`,
    password: "correct-horse-battery-staple",
    name: "E2E Owner",
    username,
  };
}

export function resetOwnerPool(owners) {
  writeFileSync(OWNER_POOL_PATH, JSON.stringify(owners));
  writeFileSync(OWNER_NEXT_PATH, "0");
}

// A file, not a variable: Playwright restarts the worker process after a failure.
function claimOwner() {
  const owners = JSON.parse(readFileSync(OWNER_POOL_PATH, "utf8"));
  const next = Number(readFileSync(OWNER_NEXT_PATH, "utf8"));
  if (next >= owners.length) throw new Error("The e2e owner pool is used up; raise OWNER_POOL_SIZE in e2e/owner.js");
  writeFileSync(OWNER_NEXT_PATH, String(next + 1));
  return owners[next];
}

export function daysAgo(n) {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

const DEFAULT_LOCATION = { id: "l1", name: "Test Crag", country: "United Kingdom" };
const DEFAULT_PLACE = { id: "p1", locationId: "l1", area: "" };
const ENTRY_DEFAULTS = { placeId: "p1", type: "boulder", status: "send", grade: "6A", date: daysAgo(1) };

function createOwner(username, request) {
  const api = async (method, path, data) => {
    const res = await request.fetch(`${OWNED_ORIGIN}/-/api/${path}`, { method, data });
    expect(res.ok(), `${method} ${path}: ${res.status()} ${await res.text()}`).toBe(true);
    return res;
  };
  // Ids are primary keys across all users, so each owner's are prefixed.
  const ownId = id => (id == null ? id : `${username}-${id}`);

  return {
    username,
    url: path => ownedRouteUrl(username, path),
    ownId,
    async settings(fields) {
      await api("PATCH", "settings", fields);
    },
    // Entries default to a boulder send yesterday at one crag, so a test states only what it asserts on.
    async seed({ locations = [DEFAULT_LOCATION], places = [DEFAULT_PLACE], entries = [] }) {
      for (const l of locations) await api("POST", "locations", { ...l, id: ownId(l.id) });
      for (const p of places) await api("POST", "places", { ...p, id: ownId(p.id), locationId: ownId(p.locationId) });
      for (const [i, e] of entries.entries()) {
        const entry = { ...ENTRY_DEFAULTS, id: `e${i}`, name: `Climb ${i + 1}`, ...e };
        if (entry.type === "sport") entry.sportStyle ??= "lead";
        await api("POST", "entries", { ...entry, id: ownId(entry.id), placeId: ownId(entry.placeId) });
      }
    },
  };
}

export const test = base.extend({
  owner: async ({ context }, use) => {
    const { username, cookie } = claimOwner();
    await context.addCookies([{ ...cookie, domain: "my.localhost" }]);
    await use(createOwner(username, context.request));
  },
});

export { expect };
