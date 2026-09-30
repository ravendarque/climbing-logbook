import AxeBuilder from "@axe-core/playwright";
import { expect, gotoSyncedLog, test } from "./owner.js";

const SEED = {
  entries: [
    {
      id: "e1",
      placeId: "p1",
      type: "boulder",
      status: "project",
      grade: "6A",
      gradeScale: "font",
      date: "2026-05-01",
      name: "Carousel Seed",
    },
  ],
  places: [{ id: "p1", locationId: "l1", area: "" }],
  locations: [{ id: "l1", name: "Test Crag", country: "United Kingdom" }],
};

function centredStatus(page) {
  return page.evaluate(() => {
    const viewport = document.querySelector(".status-picker-viewport").getBoundingClientRect();
    const middle = viewport.left + viewport.width / 2;
    let best = null;
    for (const item of document.querySelectorAll(".status-picker-item")) {
      const rect = item.getBoundingClientRect();
      const distance = Math.abs(rect.left + rect.width / 2 - middle);
      if (!best || distance < best.distance) best = { distance, status: item.dataset.status };
    }
    return best.distance < 1 ? best.status : null;
  });
}

async function expectSelected(page, status) {
  await expect(page.locator(`#status-group input[value="${status}"]`)).toBeChecked();
  await expect.poll(() => centredStatus(page)).toBe(status);
}

async function neighbour(page, side) {
  const viewport = page.locator(".status-picker-viewport");
  const box = await viewport.boundingBox();
  const slot = await viewport.evaluate(el =>
    parseFloat(getComputedStyle(el.closest("climbing-status-picker")).getPropertyValue("--status-slot")),
  );
  return { x: box.x + box.width / 2 + side * slot, y: box.y + box.height / 2 };
}

test.describe("status carousel (#1200)", () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true });

  test.beforeEach(async ({ page, owner }) => {
    await owner.seed(SEED);
    await gotoSyncedLog(page, owner);
    await page.locator("#add-btn").click();
    await expect(page.locator(".status-picker")).toBeVisible();
  });

  test("starts on Send, and tapping a neighbour or an arrow selects and centres it, wrapping round", async ({
    page,
  }) => {
    await expectSelected(page, "send");

    const right = await neighbour(page, 1);
    await page.mouse.click(right.x, right.y);
    await expectSelected(page, "project");

    const next = page.locator('.status-picker-arrow[data-step="1"]');
    const previous = page.locator('.status-picker-arrow[data-step="-1"]');
    await next.click();
    await expectSelected(page, "checkout");
    await next.click();
    await expectSelected(page, "archived");
    await next.click();
    await expectSelected(page, "flash");
    await previous.click();
    await expectSelected(page, "archived");

    const left = await neighbour(page, -1);
    await page.mouse.click(left.x, left.y);
    await expectSelected(page, "checkout");
  });

  test("tapping an arrow faster than it settles keeps the track full", async ({ page }) => {
    const next = page.locator('.status-picker-arrow[data-step="1"]');
    for (let tap = 0; tap < 7; tap++) await next.click({ delay: 0 });
    const visible = await page.evaluate(() => {
      const viewport = document.querySelector(".status-picker-viewport").getBoundingClientRect();
      return [...document.querySelectorAll(".status-picker-item")].filter(item => {
        const rect = item.getBoundingClientRect();
        return rect.right > viewport.left && rect.left < viewport.right;
      }).length;
    });
    expect(visible).toBeGreaterThanOrEqual(3);
    await expectSelected(page, "checkout");
  });

  test("a caption wider than its slot, as with a fallback font, keeps the choice centred", async ({ page }) => {
    await page.addStyleTag({ content: ".status-picker-caption { letter-spacing: .3em; }" });
    await page.locator('.status-picker-arrow[data-step="1"]').click();
    await expectSelected(page, "project");
  });

  test("dragging one slot left moves to the next status", async ({ page }) => {
    const viewport = await page.locator(".status-picker-viewport").boundingBox();
    const y = viewport.y + viewport.height / 2;
    const start = viewport.x + viewport.width * 0.75;
    await page.mouse.move(start, y);
    await page.mouse.down();
    await page.mouse.move(start - viewport.width / 3, y, { steps: 12 });
    await page.waitForTimeout(200);
    await page.mouse.up();
    await expectSelected(page, "project");
  });

  test("arrow keys on the focused radio move the carousel and show a focus ring on the frame", async ({ page }) => {
    await page.locator('#status-group input[value="send"]').focus();
    await page.keyboard.press("ArrowRight");
    await expectSelected(page, "project");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await expectSelected(page, "flash");
    await page.keyboard.press("ArrowLeft");
    await expectSelected(page, "archived");
    const outline = await page.locator(".status-picker-frame").evaluate(frame => getComputedStyle(frame).outlineStyle);
    expect(outline).toBe("solid");
  });

  test("editing an entry centres its status", async ({ page }) => {
    await page.locator("#entry-close").click();
    await page.locator("#collapse-all-btn").click();
    const row = page.locator("tr", { has: page.getByText("Carousel Seed", { exact: true }) });
    await row.locator(".edit-btn").click();
    await expectSelected(page, "project");
  });

  test("the form passes axe with the carousel", async ({ page }) => {
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .include("#entry-overlay")
      .analyze();
    expect(results.violations).toEqual([]);
  });
});

test.describe("status carousel with reduced motion (#1200)", () => {
  test.use({ reducedMotion: "reduce" });

  test("moves without animating", async ({ page, owner }) => {
    await gotoSyncedLog(page, owner);
    await page.locator("#add-btn").click();
    await page.locator('.status-picker-arrow[data-step="1"]').click();
    await page.evaluate(() => new Promise(requestAnimationFrame));
    await page.evaluate(() => new Promise(requestAnimationFrame));
    expect(await centredStatus(page)).toBe("project");
  });
});
