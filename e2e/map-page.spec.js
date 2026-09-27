import { expect, test } from "./owner.js";

test("renders the shared chrome, a real map, and switches discipline (persisted via the settings PATCH)", async ({
  page,
  owner,
}) => {
  await owner.seed({
    locations: [{ id: "l1", name: "Test Crag", country: "United Kingdom" }],
    places: [{ id: "p1", locationId: "l1", area: "" }],
    entries: [
      {
        id: "e1",
        placeId: "p1",
        type: "boulder",
        status: "send",
        grade: "6A",
        date: "2026-05-01",
        name: "Boulder Seed",
      },
      {
        id: "e2",
        placeId: "p1",
        type: "sport",
        sportStyle: "lead",
        status: "send",
        grade: "6a",
        date: "2026-05-02",
        name: "Sport Seed",
      },
    ],
  });
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
