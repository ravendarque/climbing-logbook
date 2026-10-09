import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { supportMessage } from "../server/lib/support-notify.js";
import { fetchJson, resetAuthTables } from "./support.js";

const WEBHOOK = "https://discord.com/api/webhooks/123/abc";

describe("supportMessage (#1311)", () => {
  it("names the kind and section, links to the admin page, carries none of the submitted text, and pings no one", () => {
    const body = supportMessage({
      table: "issue_reports",
      id: "r-1",
      message: `The map won't load.\n\n${"x".repeat(400)}`,
      section: "map",
      aboutLogbook: false,
      aboutEntry: false,
      errorRef: "a476bf223b229ebc",
    });
    expect(body.allowed_mentions).toEqual({ parse: [] });
    expect(body.content).toContain("**New report** · Map");
    expect(body.content).not.toContain("map won't load");
    expect(body.content).toContain("Error reference: `a476bf223b229ebc`");
    expect(body.content).toContain("https://admin.climbinglogbook.com/reports?id=r-1");
  });

  it("says when feedback or a report is about a public logbook or entry", () => {
    expect(supportMessage({ table: "feedback_submissions", id: "f", message: "Love it" }).content).toContain(
      "/feedback?id=f",
    );
    expect(supportMessage({ table: "issue_reports", id: "r", message: "Rude", aboutLogbook: true }).content).toContain(
      "About a public logbook",
    );
    expect(
      supportMessage({ table: "issue_reports", id: "r", message: "Rude", aboutLogbook: true, aboutEntry: true })
        .content,
    ).toContain("About an entry in a public logbook");
  });
});

describe("posting new submissions to Discord", () => {
  let discordCalls;
  let discordStatus;

  beforeEach(async () => {
    await resetAuthTables();
    discordCalls = [];
    discordStatus = 204;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input, init) => {
        const url = typeof input === "string" ? input : input.url;
        if (url.startsWith("https://challenges.cloudflare.com/turnstile/")) return Response.json({ success: true });
        if (url === WEBHOOK) {
          discordCalls.push(JSON.parse(init.body));
          if (discordStatus === "throw") throw new Error("network down");
          return new Response(null, { status: discordStatus });
        }
        throw new Error(`Unexpected fetch to ${url}`);
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete env.DISCORD_SUPPORT_WEBHOOK;
  });

  const report = body =>
    fetchJson("/-/api/report-issue", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "cf-connecting-ip": `203.0.113.${Math.floor(Math.random() * 250)}`,
      },
      body: JSON.stringify({ turnstileToken: "t", ...body }),
    });

  it("posts a new report without its text or the contact email", async () => {
    env.DISCORD_SUPPORT_WEBHOOK = WEBHOOK;
    const res = await report({ message: "Sync is stuck.", contactEmail: "nix@example.com", section: "logbook" });
    expect(res.status).toBe(201);
    await vi.waitFor(() => expect(discordCalls).toHaveLength(1));
    expect(discordCalls[0].content).toContain("**New report** · Logbook");
    expect(JSON.stringify(discordCalls[0])).not.toMatch(/Sync is stuck|nix@example\.com/);
  });

  it("still saves the report when Discord fails, and logs it", async () => {
    env.DISCORD_SUPPORT_WEBHOOK = WEBHOOK;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const count = async () => (await env.LOGBOOK_DB.prepare(`SELECT count(*) AS n FROM issue_reports`).first()).n;
    const before = await count();
    for (const failure of [500, "throw"]) {
      discordStatus = failure;
      expect((await report({ message: "Still broken." })).status).toBe(201);
    }
    await vi.waitFor(() =>
      expect(warn.mock.calls.filter(([line]) => line.includes("support.notify.failed"))).toHaveLength(2),
    );
    expect((await count()) - before).toBe(2);
  });

  it("does nothing where no webhook is set", async () => {
    expect((await report({ message: "Local test." })).status).toBe(201);
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(discordCalls).toHaveLength(0);
  });
});
