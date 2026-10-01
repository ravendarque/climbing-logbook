import { blockIndexedDb } from "./entries-cache.js";
import { expect } from "./owner.js";

export async function expectWiderWindowRefetch(page, url, apiPath) {
  await blockIndexedDb(page);
  const isReport = req => req.url().includes(`/-/api/performance/${apiPath}`);
  const first = page.waitForRequest(isReport);
  await page.goto(url);
  const initialUrl = (await first).url();

  const next = page.waitForRequest(req => isReport(req) && req.url() !== initialUrl);
  await page.locator('[data-window="52w"]').click();
  const widerUrl = (await next).url();

  const startOf = u => new Date(new URL(u).searchParams.get("start")).getTime();
  expect(startOf(widerUrl)).toBeLessThan(startOf(initialUrl));
}
