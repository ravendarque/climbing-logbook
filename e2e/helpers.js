// Shared by every e2e/*.spec.js file -- single place for the "app has
// finished booting" wait, instead of each spec re-deriving it from
// client/main.js's #loading/#app swap (see boot(), near the end of the
// file).
export async function gotoApp(page) {
  await page.goto("/logbook/");
  await page.locator("#loading").waitFor({ state: "hidden" });
  await page.locator("#app").waitFor({ state: "visible" });
}
