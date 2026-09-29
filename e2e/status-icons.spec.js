import { expect, gotoSyncedLog, test } from "./owner.js";

test("Flash matches Archived's size, and Send, Project and Check out run 2px larger, so none looks off", async ({
  page,
  owner,
}) => {
  await gotoSyncedLog(page, owner);
  await page.locator("#add-btn").click();
  await expect(page.locator(".status-picker")).toBeVisible();

  const longestInkSide = await page.evaluate(() => {
    const sides = {};
    for (const item of document.querySelectorAll(".status-picker-item[data-status]")) {
      if (item.dataset.status in sides) continue;
      item.style.transform = "none";
      const svg = item.querySelector("svg");
      const shapes = [...svg.querySelectorAll("path, circle, ellipse, rect, polygon")]
        .map(shape => shape.getBoundingClientRect())
        .filter(rect => rect.width || rect.height);
      const width = Math.max(...shapes.map(r => r.right)) - Math.min(...shapes.map(r => r.left));
      const height = Math.max(...shapes.map(r => r.bottom)) - Math.min(...shapes.map(r => r.top));
      sides[item.dataset.status] = (Math.max(width, height) * 24) / svg.getBoundingClientRect().width;
    }
    return sides;
  });

  const expected = {
    flash: longestInkSide.archived,
    send: longestInkSide.archived + 2,
    project: longestInkSide.archived + 2,
    checkout: longestInkSide.archived + 2,
  };
  for (const [icon, side] of Object.entries(expected)) {
    expect(Math.abs(longestInkSide[icon] - side), icon).toBeLessThanOrEqual(1);
  }
});
