import { expect, test } from "./owner.js";

test("renders the shared chrome, a real map, and switches discipline (persisted via the settings PATCH)", async ({
  page,
  owner,
}) => {
  await owner.seed({ entries: [{ type: "boulder" }, { type: "sport", grade: "6a" }] });
  await page.goto(owner.url("/map"));

  await expect(page.locator("climbing-header h1")).toHaveText("Climbing Logbook");

  await expect(page.locator("#map-container svg")).toBeVisible();
  await expect(page.locator("#map-load-retry")).toHaveCount(0);
  await expect(page.locator("#subtitle")).not.toHaveText("");

  await page.locator("#discipline-btn").click();
  await Promise.all([
    page.waitForResponse(res => res.url().includes("/-/api/settings") && res.request().method() === "PATCH"),
    page.locator('.discipline-option[data-discipline="sport"]').click(),
  ]);
  await expect(page.locator("#discipline-btn-label")).toHaveText("Sport");

  await page.reload();
  await expect(page.locator("#discipline-btn-label")).toHaveText("Sport");

  await page.locator("#discipline-btn").click();
  await page.locator('.discipline-option[data-discipline="boulder"]').click();
  await expect(page.locator("#discipline-btn-label")).toHaveText("Boulder");
});
