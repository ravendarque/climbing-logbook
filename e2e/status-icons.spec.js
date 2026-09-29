import { expect, gotoSyncedLog, test } from "./owner.js";

test("Flash, Send and Project draw their ink as large as Archived's, so no status icon looks smaller", async ({
  page,
  owner,
}) => {
  await gotoSyncedLog(page, owner);
  await page.locator("#add-btn").click();
  await expect(page.locator("#status-group")).toBeVisible();

  const longestInkSide = await page.evaluate(() => {
    const sides = {};
    for (const span of document.querySelectorAll("#status-group [data-icon]")) {
      const shapes = [...span.querySelectorAll("svg path, svg circle, svg ellipse, svg rect, svg polygon")]
        .map(shape => shape.getBoundingClientRect())
        .filter(rect => rect.width || rect.height);
      const width = Math.max(...shapes.map(r => r.right)) - Math.min(...shapes.map(r => r.left));
      const height = Math.max(...shapes.map(r => r.bottom)) - Math.min(...shapes.map(r => r.top));
      sides[span.dataset.icon] = Math.max(width, height);
    }
    return sides;
  });

  for (const icon of ["flash", "send", "project"]) {
    expect(Math.abs(longestInkSide[icon] - longestInkSide.archived), icon).toBeLessThanOrEqual(1);
  }
});
