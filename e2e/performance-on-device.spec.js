import { blockIndexedDb } from "./entries-cache.js";
import { daysAgo, expect, gotoSyncedLog, test } from "./owner.js";

const REPORTS = [
  { path: "/performance/pyramid", root: "climbing-grade-pyramid" },
  { path: "/performance/injury", root: "#injury-log-root" },
  { path: "/performance/strengths", root: "#strengths-root" },
  { path: "/performance/trends", root: "#trends-root" },
  { path: "/performance/gap", root: "#gap-root" },
  { path: "/performance/rpe", root: "#rpe-root" },
];

async function syncedAthlete(page, owner, entries = [{ grade: "6B" }]) {
  await owner.settings({ athleteMode: true });
  await owner.seed({ entries });
  await gotoSyncedLog(page, owner);
}

function trackReportRequests(page) {
  const requests = [];
  page.on("request", req => {
    if (req.url().includes("/-/api/performance/")) requests.push(req.url());
  });
  return requests;
}

test.describe("Performance on the device (ADR-0031)", () => {
  test("every report renders from the device with no connection to the API", async ({ page, owner }) => {
    await syncedAthlete(page, owner);
    await page.route("**/-/api/**", route => route.abort("internetdisconnected"));

    for (const { path, root } of REPORTS) {
      await page.goto(owner.url(path));
      await expect(page.locator(root), path).toBeVisible();
      await expect(page.locator("#performance-offline"), path).toBeHidden();
    }
  });

  test("computes on the device, so changing the window asks the server for nothing", async ({ page, owner }) => {
    await syncedAthlete(page, owner, [{ grade: "6B", date: daysAgo(200) }]);
    const requests = trackReportRequests(page);

    await page.goto(owner.url("/performance/trends"));
    await expect(page.locator("#trends-root")).toContainText("No sends logged in this window yet.");
    await page.locator('[data-window="52w"]').click();
    await expect(page.locator("#trends-root")).toContainText("1 send logged in this window");
    expect(requests).toEqual([]);
  });

  test("counts a climb that's still waiting to sync", async ({ page, owner }) => {
    await syncedAthlete(page, owner, []);
    await page.evaluate(
      ({ key, record }) => localStorage.setItem(key, JSON.stringify([{ kind: "entry", op: "add", record }])),
      {
        key: `logbook_pending_queue:${owner.username}`,
        record: {
          id: "queued-send",
          placeId: owner.ownId("p1"),
          type: "boulder",
          status: "send",
          grade: "6B",
          gradeScale: "font",
          date: daysAgo(1),
          name: "Queued send",
          firstAttempt: false,
        },
      },
    );
    await page.route("**/-/api/**", route => route.abort("internetdisconnected"));

    await page.goto(owner.url("/performance/trends"));
    await expect(page.locator("#trends-root")).toContainText("1 send logged in this window");
  });

  test("picks up a climb logged on another device once the background sync lands", async ({ page, owner }) => {
    await syncedAthlete(page, owner, []);
    await owner.api("POST", "locations", { id: owner.ownId("l1"), name: "Test Crag", country: "United Kingdom" });
    await owner.api("POST", "places", { id: owner.ownId("p1"), locationId: owner.ownId("l1"), area: "" });
    await owner.api("POST", "entries", {
      id: owner.ownId("elsewhere"),
      placeId: owner.ownId("p1"),
      type: "boulder",
      status: "send",
      grade: "6B",
      date: daysAgo(1),
      name: "Logged elsewhere",
    });

    await page.goto(owner.url("/performance/trends"));
    await expect(page.locator("#trends-root")).toContainText("1 send logged in this window");
  });

  test("on a device that keeps no data, the report comes from the server", async ({ page, owner }) => {
    await blockIndexedDb(page);
    await syncedAthlete(page, owner);
    const requests = trackReportRequests(page);

    await page.goto(owner.url("/performance/trends"));
    await expect(page.locator("#trends-root")).toContainText("1 send logged in this window");
    expect(requests.some(url => url.includes("/-/api/performance/volume?"))).toBe(true);
  });

  test("an unsynced device syncs first, then comes back to the report", async ({ page, owner }) => {
    await owner.settings({ athleteMode: true });
    await owner.seed({ entries: [{ grade: "6B" }] });

    const visited = [];
    page.on("framenavigated", frame => {
      if (frame === page.mainFrame()) visited.push(new URL(frame.url()).pathname);
    });

    await page.goto(owner.url("/performance/gap"));
    await expect(page.locator("#gap-root svg")).toBeVisible();
    expect(visited).toContain(`/${owner.username}/sync`);
    expect(visited.at(-1)).toBe(`/${owner.username}/performance/gap`);
  });
});
