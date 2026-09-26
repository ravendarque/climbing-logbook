import { env } from "cloudflare:workers";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createAuthedSession, fetchJson, resetAuthTables } from "./support.js";

const REPORT_URL = "/-/api/report-issue";

beforeAll(() => { env.BETA_GATE_ENABLED = "false"; });
afterAll(() => { env.BETA_GATE_ENABLED = "true"; });

beforeEach(async () => {
  await resetAuthTables();
  await env.LOGBOOK_DB.prepare(`DELETE FROM issue_reports`).run();
  await env.LOGBOOK_DB.prepare(`DELETE FROM rate_limits`).run();
});
afterEach(() => { vi.unstubAllGlobals(); });

function stubSiteverify(success) {
  vi.stubGlobal("fetch", vi.fn(async (input) => {
    const url = typeof input === "string" ? input : input.url;
    if (url.startsWith("https://challenges.cloudflare.com/turnstile/")) {
      return new Response(JSON.stringify({ success }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (url.startsWith("https://api.resend.com/")) {
      return new Response(JSON.stringify({ id: "fake-resend-id" }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    throw new Error(`Unexpected fetch to ${url}`);
  }));
}

function postReport(body, headers = {}) {
  return fetchJson(REPORT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("handleReportIssue", () => {
  it("stores a valid submission and returns 201", async () => {
    stubSiteverify(true);
    const res = await postReport({ message: "The map pin popover doesn't close.", turnstileToken: "any-token" });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true });

    const { results } = await env.LOGBOOK_DB.prepare(`SELECT * FROM issue_reports`).all();
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      message: "The map pin popover doesn't close.",
      contact_email: null,
      user_id: null,
      source_page: null,
      section: null,
    });
  });

  it("rejects an empty message", async () => {
    stubSiteverify(true);
    const res = await postReport({ message: "", turnstileToken: "any-token" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Please describe the issue.");
  });

  it("rejects a missing turnstileToken", async () => {
    const res = await postReport({ message: "Something broke." });
    expect(res.status).toBe(400);
  });

  it("rejects when siteverify reports failure", async () => {
    stubSiteverify(false);
    const res = await postReport({ message: "Something broke.", turnstileToken: "bad-token" });
    expect(res.status).toBe(403);
  });

  it("stores contactEmail, sourcePage, and section when given", async () => {
    stubSiteverify(true);
    const res = await postReport({
      message: "Broken thing", contactEmail: "me@example.com",
      sourcePage: "https://climbinglogbook.com/devuser/map", section: "map",
      turnstileToken: "any-token",
    });
    expect(res.status).toBe(201);

    const row = await env.LOGBOOK_DB.prepare(`SELECT * FROM issue_reports`).first();
    expect(row).toMatchObject({
      contact_email: "me@example.com",
      source_page: "https://climbinglogbook.com/devuser/map",
      section: "map",
    });
  });

  it("rejects a section that isn't one of the known values", async () => {
    stubSiteverify(true);
    const res = await postReport({ message: "Broken thing", section: "not-a-real-section", turnstileToken: "any-token" });
    expect(res.status).toBe(400);
  });

  it("captures the submitting user's id when a session is present", async () => {
    const { cookie, userId } = await createAuthedSession();
    stubSiteverify(true);
    const res = await postReport({ message: "Broken thing", turnstileToken: "any-token" }, { Cookie: cookie });
    expect(res.status).toBe(201);

    const row = await env.LOGBOOK_DB.prepare(`SELECT user_id FROM issue_reports`).first();
    expect(row.user_id).toBe(userId);
  });

  it("allows anonymous (logged-out) submission", async () => {
    stubSiteverify(true);
    const res = await postReport({ message: "Broken thing", turnstileToken: "any-token" });
    expect(res.status).toBe(201);
  });

  it("enforces the per-IP rate limit, then allows a fresh IP through", async () => {
    stubSiteverify(true);
    for (let i = 0; i < 5; i++) {
      const res = await postReport({ message: `Report ${i}`, turnstileToken: "any-token" }, { "cf-connecting-ip": "1.2.3.4" });
      expect(res.status).toBe(201);
    }
    const limited = await postReport({ message: "One too many", turnstileToken: "any-token" }, { "cf-connecting-ip": "1.2.3.4" });
    expect(limited.status).toBe(429);

    const otherIp = await postReport({ message: "Different connection", turnstileToken: "any-token" }, { "cf-connecting-ip": "5.6.7.8" });
    expect(otherIp.status).toBe(201);
  });

  it("rejects a malformed JSON body", async () => {
    const res = await fetchJson(REPORT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    expect(res.status).toBe(400);
  });
});
