import { expect, test } from "./owner.js";

const today = new Date().toISOString().slice(0, 10);

test("renders the shared chrome and a real grade pyramid, and switches discipline", async ({ page, owner }) => {
  await owner.settings({ athleteMode: true, activeDiscipline: "boulder" });
  await owner.seed({
    locations: [{ id: "l1", name: "Test Crag", country: "United Kingdom" }],
    places: [{ id: "p1", locationId: "l1", area: "" }],
    entries: [
      { id: "e1", placeId: "p1", type: "boulder", status: "send", grade: "6A", date: today, name: "Boulder Send" },
      {
        id: "e2",
        placeId: "p1",
        type: "sport",
        sportStyle: "lead",
        status: "send",
        grade: "6a",
        date: today,
        name: "Sport Send",
      },
    ],
  });
  await page.goto(owner.url("/performance/pyramid"));

  await expect(page.locator("climbing-header h1")).toHaveText("Climbing Logbook");
  await expect(page.locator("climbing-tab-bar a", { hasText: "Performance" })).toHaveAttribute("aria-current", "page");
  await expect(page.locator("#back-to-performance-link")).toHaveAttribute("href", `/${owner.username}/performance`);
  await expect(page.locator("#view-explainer")).toContainText("every send's grade");

  await expect(page.locator("#pyramid")).toBeVisible();
  await expect(page.locator("#pyramid")).not.toBeEmpty();
  await expect(page.locator("#performance-offline")).toBeHidden();

  await page.locator("#discipline-btn").click();
  await page.locator('.discipline-option[data-discipline="sport"]').click();
  await expect(page.locator("#discipline-btn-label")).toHaveText("Sport");

  await page.locator("#discipline-btn").click();
  await page.locator('.discipline-option[data-discipline="boulder"]').click();
  await expect(page.locator("#discipline-btn-label")).toHaveText("Boulder");
});

test("shows the offline message instead of a pyramid when the fetch fails", async ({ page, owner }) => {
  await owner.settings({ athleteMode: true });
  await page.route("**/-/api/performance/pyramid**", route => route.fulfill({ status: 500 }));
  await page.goto(owner.url("/performance/pyramid"));

  await expect(page.locator("#performance-offline")).toBeVisible();
  await expect(page.locator("climbing-grade-pyramid")).toBeHidden();
});

test("redirects to /log when Athlete Mode is off", async ({ page, owner }) => {
  await page.goto(owner.url("/performance/pyramid"));

  await page.waitForURL(`**/${owner.username}/log`);
});
