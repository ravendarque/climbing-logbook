import { expect, gotoSyncedLog, test } from "./owner.js";

const PAIN = { limb: "hand", side: "left", holdType: "crimp", movementStyle: "static", wallAngle: "overhang" };
const SEED = {
  entries: [{ id: "e1", name: "Pinch Me", painMoves: [] }],
};

async function openAddForm(page) {
  await page.locator("#add-btn").click();
  await expect(page.locator("#entry-overlay")).toBeVisible();
  await page.locator("#entry-nav-forward").click();
}

test("tracking off: the form shows why there are no pain controls, and links to turn it on", async ({
  page,
  owner,
}) => {
  await owner.settings({ athleteMode: true });
  await owner.seed(SEED);
  await gotoSyncedLog(page, owner);
  await openAddForm(page);

  await expect(page.locator("#pain-moves-on")).toBeHidden();
  await expect(page.locator("#pain-moves-off")).toContainText("Pain and injury tracking is off.");
  await expect(page.locator("#pain-moves-consent-link")).toHaveAttribute("href", `/${owner.username}/account/health`);
});

test("tracking on: the form shows the pain controls", async ({ page, owner }) => {
  await owner.settings({ athleteMode: true });
  await owner.grantPainInjuryConsent();
  await owner.seed(SEED);
  await gotoSyncedLog(page, owner);
  await openAddForm(page);

  await expect(page.locator("#pain-moves-on")).toBeVisible();
  await expect(page.locator("#pain-moves-off")).toBeHidden();
});

test("tracking paused: the form says so instead of showing the pain controls", async ({ page, owner }) => {
  await owner.settings({ athleteMode: true });
  await owner.grantPainInjuryConsent();
  await owner.seed(SEED);
  await page.route("**/-/api/settings", async route => {
    if (route.request().method() !== "GET") return route.fallback();
    const res = await route.fetch();
    const body = await res.json();
    body.healthConsent = {
      painInjury: true,
      painInjuryUpdate: { version: "2099-01-01", required: true, changes: [] },
    };
    return route.fulfill({ response: res, json: body });
  });
  await gotoSyncedLog(page, owner);
  await openAddForm(page);

  await expect(page.locator("#pain-moves-on")).toBeHidden();
  await expect(page.locator("#pain-moves-off")).toContainText("paused until you agree to the updated wording");
});

test("tracking off: the injury page explains instead of showing a report, and the hub card says so", async ({
  page,
  owner,
}) => {
  await owner.settings({ athleteMode: true });
  await page.goto(owner.url("/performance/injury"));
  await expect(page.locator("#injury-consent-needed")).toContainText("Pain and injury tracking is off.");
  await expect(page.locator("#report-insights")).toHaveCount(0);

  await page.goto(owner.url("/performance"));
  await expect(page.locator("#insight-injury")).toContainText("Pain and injury tracking is off.");
});

test("a queued climb whose pain details are refused is saved without them, with a notice", async ({ page, owner }) => {
  await owner.settings({ athleteMode: true });
  await owner.seed(SEED);
  await gotoSyncedLog(page, owner);

  const record = {
    id: owner.ownId("queued-pain"),
    name: "Queued with pain",
    grade: "6B",
    placeId: owner.ownId("p1"),
    type: "boulder",
    status: "send",
    date: "2026-10-01",
    painMoves: [PAIN],
  };
  await page.evaluate(
    ({ key, record }) => localStorage.setItem(key, JSON.stringify([{ kind: "entry", op: "add", record }])),
    { key: `logbook_pending_queue:${owner.username}`, record },
  );
  await page.reload();
  await expect(page.locator("#sync-line-text")).toHaveText("1 change waiting to sync");
  await page.locator("#sync-now").click();

  await expect(page.locator("#sync-line")).toBeHidden();
  await expect(page.locator("#pain-dropped")).toBeVisible();
  await expect(page.locator("#sections")).toContainText("Queued with pain");
  const { entries } = await (await owner.api("GET", "entries")).json();
  const saved = entries.find(e => e.id === record.id);
  expect(saved.painMoves).toEqual([]);
});
