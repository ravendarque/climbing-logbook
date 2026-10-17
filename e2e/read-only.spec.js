import { OWNED_ORIGIN } from "./owned-route-url.js";
import { expect, gotoSyncedLog, test } from "./owner.js";

const READ_ONLY = {
  status: 503,
  headers: { "Retry-After": "300" },
  json: { error: "Climbing Logbook can't save changes for a few minutes.", code: "READ_ONLY" },
};

test("in read-only mode a climb saved online is queued, then syncs once writes are back (#1063)", async ({
  page,
  owner,
}) => {
  await owner.seed({ entries: [{ name: "Already here" }] });
  await gotoSyncedLog(page, owner);

  await page.route("**/-/api/entries", route =>
    route.request().method() === "POST" ? route.fulfill(READ_ONLY) : route.fallback(),
  );
  await page.locator("#add-btn").click();
  await page.locator("#entry-name").fill("Saved while read-only");
  await page.locator("#place-btn").click();
  await page.locator(`#place-listbox li[data-key="${owner.ownId("p1")}"]`).click();
  await page.locator("#entry-submit-btn").click();

  await expect(page.locator("#entry-overlay")).toBeHidden();
  await expect(page.locator("#sections")).toContainText("Saved while read-only");
  await expect(page.locator("#sync-line-text")).toHaveText("1 change waiting to sync");

  await page.unroute("**/-/api/entries");
  await page.locator("#sync-now").click();
  await expect(page.locator("#sync-line")).toBeHidden();
  const { entries } = await (await owner.api("GET", "entries")).json();
  expect(entries.map(entry => entry.name)).toContain("Saved while read-only");
});

test("security.txt is served on the apex and my. hosts (#1063)", async ({ request }) => {
  for (const origin of ["http://localhost:8787", OWNED_ORIGIN]) {
    const res = await request.get(`${origin}/.well-known/security.txt`);
    expect(res.status(), origin).toBe(200);
    expect(await res.text()).toContain(
      "Contact: https://github.com/ravendarque/climbing-logbook/security/advisories/new",
    );
  }
});
