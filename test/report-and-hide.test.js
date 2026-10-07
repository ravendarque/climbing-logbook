import { env, exports } from "cloudflare:workers";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createAuthedSession, fetchJson, jsonRequest, resetAuthTables, seedPlace } from "./support.js";

const admin = (path, init) => exports.default.fetch(`https://admin.example.com${path}`, init);

function stubSiteverify() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async input => {
      const url = typeof input === "string" ? input : input.url;
      if (url.startsWith("https://challenges.cloudflare.com/turnstile/")) return Response.json({ success: true });
      throw new Error(`Unexpected fetch to ${url}`);
    }),
  );
}

function report(body) {
  stubSiteverify();
  return jsonRequest("POST", "/-/api/report-issue", { turnstileToken: "token", ...body });
}

async function logbookWithClimbs() {
  const { cookie, userId } = await createAuthedSession();
  const { username } = await env.LOGBOOK_DB.prepare(`SELECT username FROM "user" WHERE id = ?`).bind(userId).first();
  const placeId = await seedPlace(cookie);
  const post = async name => {
    const res = await jsonRequest(
      "POST",
      "/-/api/entries",
      { name, grade: "6B", placeId, type: "boulder", status: "send", notes: `${name} notes` },
      { Cookie: cookie },
    );
    return (await res.json()).entry.id;
  };
  return { cookie, userId, username, kept: await post("Kept"), reported: await post("Reported") };
}

async function publicNames(username, path = "entries") {
  const res = await fetchJson(`/-/api/public/${username}/${path}`);
  return (await res.json()).entries.map(entry => entry.name);
}

beforeAll(() => {
  env.BETA_GATE_ENABLED = "false";
  env.ADMIN_ACCESS_CHECK = "off";
});
afterAll(() => {
  env.BETA_GATE_ENABLED = "true";
  delete env.ADMIN_ACCESS_CHECK;
});
beforeEach(async () => {
  await resetAuthTables();
  for (const table of ["issue_reports", "admin_audit_log", "rate_limits"]) {
    await env.LOGBOOK_DB.prepare(`DELETE FROM ${table}`).run();
  }
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("reporting a public logbook", () => {
  it("records which logbook and climb a report is about, and shows them to the admin", async () => {
    const owner = await logbookWithClimbs();
    const res = await report({
      message: "Scam link in the notes",
      section: "public_logbook",
      reportedUsername: owner.username.toUpperCase(),
      reportedEntryId: owner.reported,
    });
    expect(res.status).toBe(201);

    const { submissions } = await (await admin("/-/api/admin/reports")).json();
    expect(submissions[0]).toMatchObject({
      section: "public_logbook",
      reportedUsername: owner.username,
      reportedEntry: { id: owner.reported, name: "Reported", notes: "Reported notes", hidden: false },
    });
  });

  it("drops what doesn't resolve, so a report can't probe for private logbooks or climbs", async () => {
    const owner = await logbookWithClimbs();
    await env.LOGBOOK_DB.prepare(`INSERT INTO settings (user_id, logbook_public) VALUES (?, 0)`)
      .bind(owner.userId)
      .run();
    await report({ message: "Private", reportedUsername: owner.username, reportedEntryId: owner.reported });
    await report({ message: "Nobody", reportedUsername: "nobody-here", reportedEntryId: "nope" });

    const rows = await env.LOGBOOK_DB.prepare(`SELECT reported_user_id, reported_entry_id FROM issue_reports`).all();
    expect(rows.results).toEqual([
      { reported_user_id: null, reported_entry_id: null },
      { reported_user_id: null, reported_entry_id: null },
    ]);
  });

  it("keeps the logbook but drops a climb that isn't in it", async () => {
    const owner = await logbookWithClimbs();
    const other = await logbookWithClimbs();
    await report({ message: "Mixed", reportedUsername: owner.username, reportedEntryId: other.reported });
    const row = await env.LOGBOOK_DB.prepare(`SELECT reported_user_id, reported_entry_id FROM issue_reports`).first();
    expect(row).toEqual({ reported_user_id: owner.userId, reported_entry_id: null });
  });
});

describe("hiding a climb", () => {
  it("takes it off every public view, keeps it for its owner, and logs it", async () => {
    const owner = await logbookWithClimbs();
    const { cursor: before } = await (
      await jsonRequest("GET", "/-/api/entries?since=0", undefined, { Cookie: owner.cookie })
    ).json();

    expect((await admin(`/-/api/admin/entries/${owner.reported}/hide`, { method: "POST" })).status).toBe(200);

    expect(await publicNames(owner.username)).toEqual(["Kept"]);
    expect(await publicNames(owner.username, "entries?limit=50")).toEqual(["Kept"]);
    const counts = await (await fetchJson(`/-/api/public/${owner.username}/entries/counts`)).json();
    expect(Object.values(counts.counts)).toEqual([1]);
    const map = await (await fetchJson(`/-/api/public/${owner.username}/map/counts`)).json();
    expect(Object.values(map)[0].boulder.total).toBe(1);

    const own = await (await jsonRequest("GET", "/-/api/entries", undefined, { Cookie: owner.cookie })).json();
    expect(own.entries.find(entry => entry.id === owner.reported).hidden).toBe(true);
    const delta = await (
      await jsonRequest("GET", `/-/api/entries?since=${before + 1}`, undefined, { Cookie: owner.cookie })
    ).json();
    expect(delta.entries.map(entry => entry.id)).toContain(owner.reported);

    const { entries } = await (await admin("/-/api/admin/audit")).json();
    expect(entries[0]).toMatchObject({ action: "hide", username: owner.username, detail: "Reported" });
  });

  it("puts it back when unhidden, and the owner can still edit a hidden climb", async () => {
    const owner = await logbookWithClimbs();
    await admin(`/-/api/admin/entries/${owner.reported}/hide`, { method: "POST" });
    const edit = await jsonRequest(
      "PUT",
      "/-/api/entries",
      {
        id: owner.reported,
        name: "Reported",
        grade: "6B",
        placeId: await seedPlace(owner.cookie, { area: "Sector 2" }),
        type: "boulder",
        status: "send",
        notes: "Cleaned up",
      },
      { Cookie: owner.cookie },
    );
    expect(edit.status).toBe(200);
    expect(await publicNames(owner.username)).toEqual(["Kept"]);

    await admin(`/-/api/admin/entries/${owner.reported}/unhide`, { method: "POST" });
    expect((await publicNames(owner.username)).toSorted()).toEqual(["Kept", "Reported"]);
  });

  it("knows only real climbs and its own two actions", async () => {
    expect((await admin("/-/api/admin/entries/nope/hide", { method: "POST" })).status).toBe(404);
    expect((await admin("/-/api/admin/entries/nope/delete", { method: "POST" })).status).toBe(404);
    expect((await admin("/-/api/admin/entries/nope/hide")).status).toBe(404);
  });
});
