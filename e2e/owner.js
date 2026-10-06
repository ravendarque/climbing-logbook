import { readFileSync, writeFileSync } from "node:fs";
import { expect, test as base } from "@playwright/test";
import { OWNED_ORIGIN, ownedRouteUrl } from "./owned-route-url.js";

export const OWNER_POOL_PATH = "e2e/.auth/owners.json";
const OWNER_NEXT_PATH = "e2e/.auth/owners-next";
export const OWNER_POOL_SIZE = 300;
export const NEW_OWNER_POOL_PATH = "e2e/.auth/new-owners.json";
const NEW_OWNER_NEXT_PATH = "e2e/.auth/new-owners-next";
export const NEW_OWNER_POOL_SIZE = 10;
export const DEMO_TOUR_SEEN = { name: "logbook_demo_tour_seen", value: "1" };

function ownerIdentity(username) {
  return { username, email: `${username}@climbinglogbook.local`, password: "correct-horse-battery-staple" };
}

export function ownerPoolUser(i) {
  return { ...ownerIdentity(`e2eowner${String(i).padStart(3, "0")}`), name: "E2E Owner" };
}

// Users who haven't been through the first-login setup yet.
export function newOwnerPoolUser(i) {
  return { ...ownerIdentity(`e2enew${String(i).padStart(3, "0")}`), name: "E2E New Owner" };
}

export function resetOwnerPool(owners, newOwners) {
  writeFileSync(OWNER_POOL_PATH, JSON.stringify(owners));
  writeFileSync(OWNER_NEXT_PATH, "0");
  writeFileSync(NEW_OWNER_POOL_PATH, JSON.stringify(newOwners));
  writeFileSync(NEW_OWNER_NEXT_PATH, "0");
}

function claimFrom(poolPath, nextPath) {
  const owners = JSON.parse(readFileSync(poolPath, "utf8"));
  const next = Number(readFileSync(nextPath, "utf8"));
  if (next >= owners.length) throw new Error(`The e2e pool in ${poolPath} is used up; raise its size in e2e/owner.js`);
  writeFileSync(nextPath, String(next + 1));
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
  const ownId = id => (id == null ? id : `${username}-${id}`);

  return {
    ...ownerIdentity(username),
    url: path => ownedRouteUrl(username, path),
    ownId,
    api,
    async settings(fields) {
      await api("PATCH", "settings", fields);
    },
    async seed({
      entries = [],
      locations = entries.length ? [DEFAULT_LOCATION] : [],
      places = entries.length ? [DEFAULT_PLACE] : [],
    }) {
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

export async function gotoSyncedLog(page, owner) {
  await page.goto(owner.url(`/sync?returnTo=${encodeURIComponent(`/${owner.username}/log`)}`));
  await page.waitForURL(`**/${owner.username}/log`);
  await expect(page.locator("climbing-entries-table")).toBeVisible();
  const settingsKey = `logbook_settings_cache:${owner.username}`;
  await expect.poll(() => page.evaluate(key => localStorage.getItem(key) !== null, settingsKey)).toBe(true);
  await page.waitForLoadState("networkidle");
}

export const test = base.extend({
  owner: async ({ context }, use) => {
    const { username, cookie } = claimFrom(OWNER_POOL_PATH, OWNER_NEXT_PATH);
    await context.addCookies([{ ...cookie, domain: "my.localhost" }]);
    await use(createOwner(username, context.request));
  },
  newOwner: async ({ context }, use) => {
    const { username, cookie } = claimFrom(NEW_OWNER_POOL_PATH, NEW_OWNER_NEXT_PATH);
    await context.addCookies([{ ...cookie, domain: "my.localhost" }]);
    await use(createOwner(username, context.request));
  },
});

export { expect };
