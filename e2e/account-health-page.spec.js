import { PAIN_INJURY_WORDING, pointText } from "../shared/health-consent.js";
import { expect, test } from "./owner.js";

const PAIN = { limb: "hand", side: "left", holdType: "crimp", movementStyle: "static", wallAngle: "overhang" };

test("off: explains it, and Turn on waits for the box and records the current wording", async ({ page, owner }) => {
  await page.goto(owner.url("/account/health"));

  await expect(page.getByRole("heading", { name: "Health data", level: 1 })).toBeVisible();
  await expect(page.locator("#health-points li")).toHaveText(PAIN_INJURY_WORDING.points.map(pointText));
  await expect(page.locator("#health-statement")).toHaveText(PAIN_INJURY_WORDING.statement);
  await expect(page.locator("#health-withdraw")).toBeHidden();

  const turnOn = page.getByRole("button", { name: "Turn on" });
  await expect(turnOn).toBeDisabled();
  await page.getByLabel(PAIN_INJURY_WORDING.statement).check();

  const [post] = await Promise.all([
    page.waitForRequest(req => req.url().endsWith("/-/api/consent/pain-injury") && req.method() === "POST"),
    turnOn.click(),
  ]);
  expect(post.postDataJSON()).toEqual({ version: expect.any(String) });
  await expect(page.locator("#health-title")).toBeFocused();
  await expect(page.getByRole("button", { name: "Turn off and delete" })).toBeVisible();
  await expect(page.locator("#health-grant")).toBeHidden();
});

test("on: the warning says what turning off deletes, and one button deletes it", async ({ page, owner }) => {
  await owner.grantPainInjuryConsent();
  await owner.seed({ entries: [{ painMoves: [PAIN] }, { painMoves: [PAIN, { ...PAIN, side: "right" }] }, {}] });
  await page.goto(owner.url("/account/health"));

  await expect(page.locator("#health-withdraw")).toContainText("Turning this off deletes all your health information.");
  await expect(page.locator("#health-withdraw")).toContainText("from our backups within 30 days");
  await expect(page.locator("#health-count")).toHaveText("You have pain and injury details on 2 entries.");
  await expect(page.locator("#health-withdraw button")).toHaveCount(1);

  await page.getByRole("button", { name: "Turn off and delete" }).click();
  await expect(page.locator("#health-title")).toBeFocused();
  await expect(page.locator("#health-grant")).toBeVisible();
  await expect(page.locator("#health-withdraw")).toBeHidden();

  const status = await (await owner.api("GET", "consent/pain-injury")).json();
  expect(status).toMatchObject({ granted: false, entriesWithPain: 0 });
});

test("My account shows the card with its state and links to the page", async ({ page, owner }) => {
  await owner.settings({ athleteMode: true });
  await page.goto(owner.url("/account"));
  await expect(page.locator("#health-status")).toHaveText("Off");

  await owner.grantPainInjuryConsent();
  await owner.settings({ athleteMode: false });
  await page.reload();

  const row = page.locator("#health-row");
  await expect(row).toContainText("Health data");
  await expect(page.locator("#health-status")).toHaveText("On");
  await expect(row).toHaveAttribute("href", `/${owner.username}/account/health`);
});

test("offline: the buttons are disabled with a note, and come back with the connection", async ({
  page,
  context,
  owner,
}) => {
  await page.goto(owner.url("/account/health"));
  await expect(page.getByRole("button", { name: "Turn on" })).toBeVisible();
  await page.getByLabel(PAIN_INJURY_WORDING.statement).check();
  const turnOn = page.getByRole("button", { name: "Turn on" });
  await expect(turnOn).toBeEnabled();

  await context.setOffline(true);
  await expect(turnOn).toBeDisabled();
  await expect(page.locator("#health-offline-note")).toBeVisible();

  await context.setOffline(false);
  await expect(turnOn).toBeEnabled();
  await expect(page.locator("#health-offline-note")).toBeHidden();
});

test("My account hides the card when Athlete Mode is off and tracking was never turned on", async ({ page, owner }) => {
  await page.goto(owner.url("/account"));
  await expect(page.locator("#beta-row")).toBeVisible();
  await expect(page.locator("#health-row")).toBeHidden();
});
