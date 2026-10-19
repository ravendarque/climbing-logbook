import { blockIndexedDb } from "./entries-cache.js";
import { expect, gotoSyncedLog, test } from "./owner.js";

const SEED = {
  locations: [
    { id: "l1", name: "Fontainbleau", country: "France" },
    { id: "l2", name: "Magic Wood", country: "Switzerland" },
  ],
  places: [
    { id: "p1", locationId: "l1", area: "Bas Cuvier" },
    { id: "p2", locationId: "l1", area: "Apremont" },
    { id: "p3", locationId: "l2", area: "Bachbett" },
  ],
  entries: [
    { id: "e1", placeId: "p1", name: "La Marie-Rose" },
    { id: "e2", placeId: "p1", name: "Le Carré d'As" },
    { id: "e3", placeId: "p2", name: "Big Boss" },
    { id: "e4", placeId: "p3", name: "Riverbed" },
  ],
};

async function openPlaces(page, owner) {
  await owner.seed(SEED);
  await gotoSyncedLog(page, owner);
  await page.goto(owner.url("/account/places"));
  await expect(page.locator(`[data-location-id="${owner.ownId("l1")}"]`)).toContainText("3 climbs");
}

const serverState = async owner => ({
  locations: (await (await owner.api("GET", "locations")).json()).locations,
  places: (await (await owner.api("GET", "places")).json()).places,
  entries: (await (await owner.api("GET", "entries")).json()).entries,
});

test("lists every location with its country, areas and climbs, and is linked from My account (#159)", async ({
  page,
  owner,
}) => {
  await openPlaces(page, owner);
  const font = page.locator(`[data-location-id="${owner.ownId("l1")}"]`);
  await expect(font).toContainText("Fontainbleau");
  await expect(font).toContainText("France · 2 areas · 3 climbs");
  await expect(page.locator(`[data-location-id="${owner.ownId("l2")}"]`)).toContainText("1 area · 1 climb");

  await page.goto(owner.url("/account"));
  await expect(page.locator("#places-link")).toHaveAttribute("href", `/${owner.username}/account/places`);
});

test("renames a location, changes its country and renames an area (#159)", async ({ page, owner }) => {
  await openPlaces(page, owner);
  await page.locator(`[data-edit="${owner.ownId("l1")}"]`).click();
  await page.locator("#place-edit-name").fill("Fontainebleau");
  await page.locator("#place-edit-country").selectOption("Belgium");
  await page.locator(`[data-area-id="${owner.ownId("p2")}"]`).fill("Apremont Bizons");
  await page.locator("#place-edit-save").click();

  await expect(page.locator("#place-edit-overlay")).toBeHidden();
  await expect(page.locator(`[data-location-id="${owner.ownId("l1")}"]`)).toContainText("Fontainebleau");
  await expect(page.locator("#sync-line")).toBeHidden();
  const { locations, places } = await serverState(owner);
  expect(locations.find(l => l.id === owner.ownId("l1"))).toMatchObject({ name: "Fontainebleau", country: "Belgium" });
  expect(places.find(p => p.id === owner.ownId("p2")).area).toBe("Apremont Bizons");
});

test("won't rename a location to a name already used", async ({ page, owner }) => {
  await openPlaces(page, owner);
  await page.locator(`[data-edit="${owner.ownId("l1")}"]`).click();
  await page.locator("#place-edit-name").fill("magic wood");
  await page.locator("#place-edit-save").click();
  await expect(page.locator("#place-edit-error")).toHaveText('You already have a location called "magic wood".');
});

test("deletes an area, moving its climbs to another area first (#160)", async ({ page, owner }) => {
  await openPlaces(page, owner);
  await page.locator(`[data-edit="${owner.ownId("l1")}"]`).click();
  await page.locator(`[data-delete-area="${owner.ownId("p2")}"]`).click();
  await expect(page.locator("#place-delete-text")).toHaveText(
    "1 climb is at Apremont. Choose where they go: they keep everything else.",
  );
  await page.locator("#place-delete-target").selectOption(owner.ownId("p1"));
  await page.locator("#place-delete-btn").click();

  await expect(page.locator(`[data-area-id="${owner.ownId("p2")}"]`)).toHaveCount(0);
  await expect(page.locator("#sync-line")).toBeHidden();
  const { places, entries } = await serverState(owner);
  expect(places.map(p => p.id)).not.toContain(owner.ownId("p2"));
  expect(entries.find(e => e.id === owner.ownId("e3")).placeId).toBe(owner.ownId("p1"));
});

test("deletes a location, moving the climbs from all its areas to one place elsewhere (#160)", async ({
  page,
  owner,
}) => {
  await openPlaces(page, owner);
  await page.locator(`[data-edit="${owner.ownId("l1")}"]`).click();
  await expect(page.locator("#place-delete-btn")).toHaveText("Move 3 climbs and delete");
  await page.locator("#place-delete-target").selectOption(owner.ownId("p3"));
  await page.locator("#place-delete-btn").click();

  await expect(page.locator("#place-edit-overlay")).toBeHidden();
  await expect(page.locator(`[data-location-id="${owner.ownId("l1")}"]`)).toHaveCount(0);
  await expect(page.locator(`[data-location-id="${owner.ownId("l2")}"]`)).toContainText("4 climbs");
  await expect(page.locator("#sync-line")).toBeHidden();
  const { locations, entries } = await serverState(owner);
  expect(locations.map(l => l.id)).toEqual([owner.ownId("l2")]);
  expect(new Set(entries.map(e => e.placeId))).toEqual(new Set([owner.ownId("p3")]));
});

test("a pull that lands after the delete is confirmed keeps the moved climbs where they went (#1471)", async ({
  page,
  owner,
}) => {
  const isLocationDelete = res => res.request().method() === "DELETE" && res.url().includes("/-/api/locations");
  let releaseHeldPull;
  const deleteConfirmed = new Promise(resolve => {
    releaseHeldPull = resolve;
  });
  page.on("response", res => {
    if (isLocationDelete(res)) releaseHeldPull();
  });

  await owner.seed(SEED);
  await gotoSyncedLog(page, owner);
  let held = false;
  await page.route("**/-/api/entries?since=*", async route => {
    if (held) return route.continue();
    held = true;
    const response = await route.fetch();
    await deleteConfirmed;
    return route.fulfill({ response });
  });
  await page.goto(owner.url("/account/places"));
  await expect(page.locator(`[data-location-id="${owner.ownId("l1")}"]`)).toContainText("3 climbs");

  await page.locator(`[data-edit="${owner.ownId("l1")}"]`).click();
  await page.locator("#place-delete-target").selectOption(owner.ownId("p3"));
  const heldPullLanded = page.waitForResponse(res => res.url().includes("/-/api/entries?since="));
  await page.locator("#place-delete-btn").click();
  await page.waitForResponse(isLocationDelete);
  await heldPullLanded;

  await expect(page.locator(`[data-location-id="${owner.ownId("l2")}"]`)).toContainText("4 climbs");
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

test("offline, a rename shows at once and syncs by itself once the connection is back (#159)", async ({
  page,
  context,
  owner,
}) => {
  await openPlaces(page, owner);
  await context.setOffline(true);
  await page.locator(`[data-edit="${owner.ownId("l2")}"]`).click();
  await page.locator("#place-edit-name").fill("Magic Wood (Averstal)");
  await page.locator("#place-edit-save").click();

  await expect(page.locator(`[data-location-id="${owner.ownId("l2")}"]`)).toContainText("Magic Wood (Averstal)");
  await expect(page.locator("#sync-line-text")).toHaveText("1 change waiting to sync");

  await context.setOffline(false);
  await expect(page.locator("#sync-line")).toBeHidden();
  const { locations } = await serverState(owner);
  expect(locations.find(l => l.id === owner.ownId("l2")).name).toBe("Magic Wood (Averstal)");
});

test("works from the server's copy on a device that keeps no data, and saves changes (#159)", async ({
  page,
  owner,
}) => {
  await owner.seed(SEED);
  await blockIndexedDb(page);
  await page.goto(owner.url("/account/places"));
  await expect(page).toHaveURL(owner.url("/account/places"));
  const font = page.locator(`[data-location-id="${owner.ownId("l1")}"]`);
  await expect(font).toContainText("France · 2 areas · 3 climbs");

  await page.locator(`[data-edit="${owner.ownId("l1")}"]`).click();
  await page.locator("#place-edit-name").fill("Fontainebleau");
  await page.locator("#place-edit-save").click();

  await expect(font).toContainText("Fontainebleau");
  await expect(page.locator("#sync-line")).toBeHidden();
  const { locations } = await serverState(owner);
  expect(locations.find(l => l.id === owner.ownId("l1")).name).toBe("Fontainebleau");
});

test("a change the server refuses shows as a failed write that can be discarded (#160)", async ({ page, owner }) => {
  await openPlaces(page, owner);
  await page.route("**/-/api/places?*", route =>
    route.request().method() === "DELETE"
      ? route.fulfill({ status: 400, contentType: "application/json", body: '{"error":"Not allowed"}' })
      : route.fallback(),
  );
  await page.locator(`[data-edit="${owner.ownId("l1")}"]`).click();
  await page.locator(`[data-delete-area="${owner.ownId("p2")}"]`).click();
  await page.locator("#place-delete-target").selectOption(owner.ownId("p1"));
  await page.locator("#place-delete-btn").click();
  await page.locator("#place-edit-cancel").click();

  const banner = page.locator("#failed-writes");
  await expect(banner).toContainText("Couldn't save the deletion of “Apremont”");
  await banner.getByRole("button", { name: "Discard" }).click();
  await expect(banner).toBeHidden();
});
