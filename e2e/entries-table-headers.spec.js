import { expect, gotoSyncedLog, test } from "./owner.js";

test("every column header is a named column header, and sortable ones sort through a button", async ({
  page,
  owner,
}) => {
  await owner.seed({ entries: [{ name: "Alpha" }, { name: "Bravo" }] });
  await gotoSyncedLog(page, owner);
  await page.locator(".place-header").first().click();

  const headers = page.getByRole("columnheader");
  await expect(headers).toHaveCount(8);
  for (const header of await headers.all()) {
    expect((await header.textContent()).trim()).not.toBe("");
  }

  for (const name of ["Grd", "Name", "Area", "Date"]) {
    const header = page.getByRole("columnheader", { name });
    await expect(header.getByRole("button", { name })).toBeVisible();
  }

  const nameHeader = page.getByRole("columnheader", { name: "Name" });
  await expect(nameHeader).toHaveAttribute("aria-sort", "none");
  await nameHeader.getByRole("button").click();
  await expect(page.getByRole("columnheader", { name: "Name" })).toHaveAttribute("aria-sort", "ascending");
  await page.getByRole("columnheader", { name: "Name" }).getByRole("button").click();
  await expect(page.getByRole("columnheader", { name: "Name" })).toHaveAttribute("aria-sort", "descending");
  await expect(page.getByRole("button", { name: /^Name/ })).toBeFocused();
});

test("the filter button says whether filters are applied, without aria-pressed", async ({ page, owner }) => {
  await owner.seed({ entries: [{ name: "Alpha" }] });
  await gotoSyncedLog(page, owner);

  const filter = page.locator("#filter-btn");
  await expect(filter).not.toHaveAttribute("aria-pressed");
  await expect(filter).toHaveAccessibleName("Filter");

  await filter.click();
  await expect(filter).toHaveAttribute("aria-expanded", "true");
  await page.locator('#filter-status-group label:has(input[data-filter="archived"])').click();
  await expect(filter).toHaveAccessibleName("Filter, filters applied");
  await expect(filter).not.toHaveAttribute("aria-pressed");
});
