// #992 -- a write queued offline before an API rename still syncs after it.
// The queue stores what to do ({ kind, op, record }), never a URL:
// client/offline-sync.js's syncOne() picks the route at replay time. Against
// the real production build and server on an owner route (my.localhost).
import { expect, test } from "@playwright/test";
import { DEV_USER } from "../scripts/lib/dev-session.mjs";
import { addOwnedRouteSessionCookie, ownedRouteUrl } from "./owned-route-url.js";

const OWNER = DEV_USER.username.toLowerCase();

test.beforeEach(async ({ context }) => { await addOwnedRouteSessionCookie(context); });

test("a queued add and delete, in the pre-#992 shape, replay to /-/api/entries", async ({ page }) => {
  await page.goto(ownedRouteUrl(DEV_USER.username, "/log"));
  await expect(page.locator("climbing-entries-table")).toBeVisible();

  const placeId = await page.evaluate(async () => (await (await fetch("/-/api/places")).json()).places[0].id);
  const record = { id: `queued-before-992-${Date.now()}`, name: "Queued before #992", grade: "6B", placeId, type: "boulder", status: "send" };
  // Exactly what entry-form.js queued before #992: an add, then a delete
  // of the same entry, which also leaves the shared dev data unchanged.
  await page.evaluate(({ owner, record }) => localStorage.setItem(`logbook_pending_queue:${owner}`, JSON.stringify([
    { kind: "entry", op: "add", record },
    { kind: "entry", op: "delete", record: { id: record.id } },
  ])), { owner: OWNER, record });
  await page.reload();
  await expect(page.locator("#sync-btn")).toHaveText(/Sync \(2\)/);

  const writes = [];
  page.on("response", res => {
    if (res.request().method() !== "GET" && res.url().includes("/-/api/")) {
      writes.push(`${res.request().method()} ${new URL(res.url()).pathname} ${res.status()}`);
    }
  });
  await page.locator("#sync-btn").click();
  await expect(page.locator("#sync-btn")).toBeHidden();

  expect(writes).toEqual(["POST /-/api/entries 201", "DELETE /-/api/entries 200"]);
  const queue = await page.evaluate(owner => localStorage.getItem(`logbook_pending_queue:${owner}`), OWNER);
  expect(JSON.parse(queue ?? "[]")).toEqual([]);
});

const queueKey = owner => `logbook_pending_queue:${owner}`;
const isEntryEdit = req => new URL(req.url()).pathname === "/-/api/entries" && req.method() === "PUT";

// #1076 -- the replay loop used to write its own leftover list back over
// the queue when it finished, erasing anything queued while it ran.
test("a write queued while a sync is in flight is still queued afterwards", async ({ page }) => {
  await page.goto(ownedRouteUrl(DEV_USER.username, "/log"));
  await expect(page.locator("climbing-entries-table")).toBeVisible();

  const placeId = await page.evaluate(async () => (await (await fetch("/-/api/places")).json()).places[0].id);
  const record = { id: `queued-during-sync-${Date.now()}`, name: "Queued during a sync", grade: "6B", placeId, type: "boulder", status: "send" };
  await page.evaluate(({ key, record }) => localStorage.setItem(key, JSON.stringify([
    { kind: "entry", op: "add", record },
  ])), { key: queueKey(OWNER), record });
  await page.reload();
  await expect(page.locator("#sync-btn")).toHaveText(/Sync \(1\)/);

  // Hold the replayed POST so the sync is still in flight.
  let postReached;
  const reached = new Promise(resolve => { postReached = resolve; });
  let releasePost;
  const released = new Promise(resolve => { releasePost = resolve; });
  await page.route(url => url.pathname === "/-/api/entries", async route => {
    if (route.request().method() === "POST") { postReached(); await released; }
    await route.continue();
  });
  await page.locator("#sync-btn").click();
  await reached;

  // What entry-form.js does when a save can't reach the server. A delete
  // of the same entry, so the shared dev data ends up unchanged.
  await page.evaluate(({ key, item }) => {
    const queue = JSON.parse(localStorage.getItem(key) ?? "[]");
    localStorage.setItem(key, JSON.stringify([...queue, item]));
  }, { key: queueKey(OWNER), item: { kind: "entry", op: "delete", record: { id: record.id } } });
  releasePost();

  await expect(page.locator("#sync-btn")).toBeEnabled();
  await expect(page.locator("#sync-btn")).toHaveText(/Sync \(1\)/);
  const queue = JSON.parse(await page.evaluate(key => localStorage.getItem(key), queueKey(OWNER)));
  expect(queue.map(({ op, record }) => `${op} ${record.id}`)).toEqual([`delete ${record.id}`]);

  await page.locator("#sync-btn").click();
  await expect(page.locator("#sync-btn")).toBeHidden();
});

// #1077 -- a save used to go straight to the server even with older
// writes still queued, so the next sync replayed an older edit over it.
test("a save made while an older edit is queued is sent after it, and wins", async ({ page }) => {
  await page.goto(ownedRouteUrl(DEV_USER.username, "/log"));
  await expect(page.locator("climbing-entries-table")).toBeVisible();

  const placeId = await page.evaluate(async () => (await (await fetch("/-/api/places")).json()).places[0].id);
  const entry = { id: `queued-edit-order-${Date.now()}`, name: "Edit order original", grade: "6B", placeId, type: "boulder", status: "send" };
  await page.evaluate(async entry => {
    const res = await fetch("/-/api/entries", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(entry) });
    if (!res.ok) throw new Error(`create failed: ${res.status}`);
  }, entry);
  await page.evaluate(({ key, record }) => localStorage.setItem(key, JSON.stringify([
    { kind: "entry", op: "edit", record },
  ])), { key: queueKey(OWNER), record: { ...entry, name: "Older queued edit" } });
  await page.reload();
  await expect(page.locator("#sync-btn")).toHaveText(/Sync \(1\)/);

  const writes = [];
  page.on("request", req => { if (isEntryEdit(req)) writes.push(`PUT ${JSON.parse(req.postData()).name}`); });

  await page.locator(`button[data-edit-id="${entry.id}"]`).evaluate(btn => btn.click());
  await expect(page.locator("#entry-name")).toBeVisible();
  await page.locator("#entry-name").fill("Newer edit");
  await page.locator("#entry-submit-btn").click();
  await expect(page.locator("#sync-btn")).toBeHidden();

  expect(writes).toEqual(["PUT Older queued edit", "PUT Newer edit"]);
  const saved = await page.evaluate(async id => (await (await fetch("/-/api/entries")).json()).entries.find(e => e.id === id), entry.id);
  expect(saved.name).toBe("Newer edit");

  await page.evaluate(id => fetch(`/-/api/entries?id=${encodeURIComponent(id)}`, { method: "DELETE" }), entry.id);
});
