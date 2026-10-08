import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BASE_URL, fetchJson } from "./support.js";

afterEach(() => {
  vi.restoreAllMocks();
  env.APP_ENV = "development";
});

function errorLines() {
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  return () => spy.mock.calls.map(([line]) => JSON.parse(line)).filter(line => line.event === "request.unhandled");
}

describe("the error boundary (#1032)", () => {
  it("answers an API throw with JSON and a reference, and logs it exactly once without the body", async () => {
    const lines = errorLines();
    const res = await fetchJson("/-/api/test/throw", {
      method: "POST",
      headers: { "Content-Type": "application/json", "cf-ray": "ray-123-LHR" },
      body: JSON.stringify({ notes: "my knee hurts", email: "nix@example.com" }),
    });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Something went wrong.", ref: "ray-123-LHR" });

    const logged = lines();
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatchObject({ ref: "ray-123-LHR", route: "/-/api/test/throw", status: 500 });
    expect(logged[0].err.message).toBe("Test error (#1032)");
    expect(JSON.stringify(logged[0])).not.toMatch(/knee|nix@example/);
  });

  it("answers a page throw with a page that gives the reference and a prefilled report link", async () => {
    errorLines();
    const res = await fetchJson("/-/test/throw", { headers: { "cf-ray": "ray-456-LHR" } });
    expect(res.status).toBe(500);
    expect(res.headers.get("Content-Type")).toContain("text/html");
    const html = await res.text();
    expect(html).toContain("ray-456-LHR");
    expect(html).toContain(`${new URL(BASE_URL).protocol}//`);
    expect(html).toContain("/help/report-an-issue/?ref=ray-456-LHR");
  });

  it("has no test route in production", async () => {
    env.APP_ENV = "production";
    expect((await fetchJson("/-/api/test/throw")).status).toBe(404);
  });
});
