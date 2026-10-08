import { exports } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleReadiness, resetReadinessCache } from "../server/api/health.js";
import { fetchJson } from "./support.js";

beforeEach(resetReadinessCache);
afterEach(() => vi.restoreAllMocks());

const log = { warn: vi.fn() };
const d1That = first => ({ prepare: vi.fn(() => ({ first })) });

describe("health checks (#1043)", () => {
  it("answers liveness without touching anything, with the version and no caching", async () => {
    const res = await fetchJson("/-/api/health");
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({ ok: true, version: expect.any(String) });
  });

  it("answers readiness once D1 responds, and HEAD works for both", async () => {
    const res = await fetchJson("/-/api/health/ready");
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
    expect((await fetchJson("/-/api/health", { method: "HEAD" })).status).toBe(200);
    expect((await fetchJson("/-/api/health/ready", { method: "HEAD" })).status).toBe(200);
  });

  it("answers 503 naming only the check when D1 fails, and logs it", async () => {
    const res = await handleReadiness(
      { LOGBOOK_DB: d1That(() => Promise.reject(new Error("D1_ERROR: secret detail"))) },
      log,
    );
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toEqual({ ok: false, check: "d1" });
    expect(JSON.stringify(body)).not.toContain("secret");
    expect(log.warn).toHaveBeenCalledWith("health.ready.failed", expect.objectContaining({ code: "d1" }));
  });

  it("answers 503 when D1 hangs past the timeout", async () => {
    vi.useFakeTimers();
    try {
      const pending = handleReadiness({ LOGBOOK_DB: d1That(() => new Promise(() => {})) }, log);
      await vi.advanceTimersByTimeAsync(2_100);
      expect((await pending).status).toBe(503);
    } finally {
      vi.useRealTimers();
    }
  });

  it("reads D1 at most once per 15 seconds, however many checks arrive", async () => {
    vi.useFakeTimers();
    try {
      const db = d1That(() => Promise.resolve({ 1: 1 }));
      for (let i = 0; i < 50; i++) expect((await handleReadiness({ LOGBOOK_DB: db }, log)).status).toBe(200);
      expect(db.prepare).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(15_000);
      await handleReadiness({ LOGBOOK_DB: db }, log);
      expect(db.prepare).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("writes no logs on success", async () => {
    const spies = ["log", "warn", "error"].map(m => vi.spyOn(console, m).mockImplementation(() => {}));
    await fetchJson("/-/api/health");
    await fetchJson("/-/api/health/ready");
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});

it("doesn't treat health as a username on the profile host", async () => {
  const res = await exports.default.fetch("https://my.example.com/-/api/health");
  expect(res.status).toBe(200);
});
