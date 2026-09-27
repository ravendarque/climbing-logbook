import { expect, test } from "./owner.js";

const LEFT_CRIMP = { limb: "hand", side: "left", holdType: "crimp", movementStyle: "static", wallAngle: "overhang" };

test("shows the not-enough-data message, empty log, and Sources section with no pain-tagged entries", async ({
  page,
  owner,
}) => {
  await owner.settings({ athleteMode: true });
  await page.goto(owner.url("/performance/injury"));

  await expect(page.locator("climbing-header h1")).toHaveText("Climbing Logbook");
  await expect(page.locator("climbing-tab-bar a", { hasText: "Performance" })).toHaveAttribute("aria-current", "page");
  await expect(page.locator("#back-to-performance-link")).toHaveAttribute("href", `/${owner.username}/performance`);
  await expect(page.locator("#view-explainer")).toContainText("Pain/injury tags");
  await expect(page.locator("#injury-headline")).toContainText("Not enough data yet");
  await expect(page.locator("#injury-log-empty")).toBeVisible();
  await expect(page.locator("body")).toContainText("Miro");
});

test("renders the ranked headline and log rows when a cluster clears the confidence gate", async ({ page, owner }) => {
  await owner.settings({ athleteMode: true });
  await owner.seed({
    locations: [{ id: "l1", name: "Test Crag", country: "United Kingdom" }],
    places: [{ id: "p1", locationId: "l1", area: "" }],
    entries: ["2026-01-01", "2026-01-02", "2026-01-03"].map((date, i) => ({
      id: `e${i}`,
      placeId: "p1",
      type: "boulder",
      status: "send",
      grade: "6A",
      date,
      name: `Painful Route ${i + 1}`,
      painMoves: [LEFT_CRIMP],
    })),
  });
  await page.goto(owner.url("/performance/injury"));

  await expect(page.locator("#injury-headline")).toHaveText("Your pain flags cluster on left hand crimps, overhang.");
  const rows = page.locator("#injury-log-list .row-card-title");
  await expect(rows).toHaveText(["Painful Route 3", "Painful Route 2", "Painful Route 1"]);
});

test("shows the offline message instead of the log when the fetch fails", async ({ page, owner }) => {
  await owner.settings({ athleteMode: true });
  await page.route("**/-/api/performance/injury", route => route.fulfill({ status: 500 }));
  await page.goto(owner.url("/performance/injury"));

  await expect(page.locator("#performance-offline")).toBeVisible();
  await expect(page.locator("#injury-log-root")).toBeHidden();
});

test("redirects to /log when Athlete Mode is off", async ({ page, owner }) => {
  await page.goto(owner.url("/performance/injury"));

  await page.waitForURL(`**/${owner.username}/log`);
});
