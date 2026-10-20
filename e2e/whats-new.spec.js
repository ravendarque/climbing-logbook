import { expect, test } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });

const RELEASES = [
  { version: "v9.2.0", date: "2026-10-20", changes: ["A beta-only change."] },
  { version: "v9.1.0", date: "2026-10-19", changes: ["A change on the main app."] },
];

async function serve(page, { version = "v9.1.0", releases = RELEASES } = {}) {
  await page.route("**/-/api/health", route => route.fulfill({ json: { ok: true, version } }));
  await page.route("**/-/releases.json", route => route.fulfill({ json: releases }));
}

test("lists beta-only releases under Beta channel and the rest under Main channel (#1506)", async ({ page }) => {
  await serve(page);
  await page.goto("/help/whats-new/");
  const list = page.locator("#whats-new-list");

  await expect(list.getByRole("heading", { level: 2 })).toHaveText(["Beta channel", "Main channel"]);
  const [beta, main] = await list.evaluate(el => {
    const text = el.textContent;
    const at = text.indexOf("Main channel");
    return [text.slice(0, at), text.slice(at)];
  });
  expect(beta).toContain("A beta-only change.");
  expect(beta).toContain("Check our beta");
  expect(main).toContain("A change on the main app.");
  expect(main).not.toContain("A beta-only change.");
  await expect(list.getByRole("link", { name: "beta channel" })).toHaveAttribute("href", "/help/beta-channel/");
});

test("says so when the beta channel has nothing the main app doesn't (#1506)", async ({ page }) => {
  await serve(page, { version: "v9.2.0" });
  await page.goto("/help/whats-new/");
  await expect(page.locator("#whats-new-list")).toContainText(
    "Nothing on the beta channel yet that isn't on the main app.",
  );
});

test("shows a spinner in the Beta channel section while it checks (#1506)", async ({ page }) => {
  let release;
  const held = new Promise(resolve => {
    release = resolve;
  });
  await page.route("**/-/api/health", async route => {
    await held;
    return route.fulfill({ json: { ok: true, version: "v9.1.0" } });
  });
  await page.route("**/-/releases.json", route => route.fulfill({ json: RELEASES }));
  await page.goto("/help/whats-new/");

  const beta = page.locator("#whats-new-beta");
  await expect(beta.getByRole("status")).toHaveText("Checking the beta channel");
  release();
  await expect(beta).toContainText("A beta-only change.");
  await expect(beta.getByRole("status")).toHaveCount(0);
});

test("keeps the built list, and says so in the Beta channel section, when the beta channel can't be read (#1506)", async ({
  page,
}) => {
  await page.route("**/-/releases.json", route => route.abort());
  await page.goto("/help/whats-new/");

  await expect(page.locator("#whats-new-beta")).toContainText("Couldn't check the beta channel just now.");
  await expect(page.locator("#whats-new-main").getByRole("listitem").first()).toBeVisible();
});
