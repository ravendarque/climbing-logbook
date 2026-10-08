import { afterEach, describe, expect, it, vi } from "vitest";
import { createLogger } from "../server/lib/log.js";
import { routeTemplate } from "../server/lib/route-template.js";

afterEach(() => vi.restoreAllMocks());

function captured(method = "log") {
  const spy = vi.spyOn(console, method).mockImplementation(() => {});
  return () => spy.mock.calls.map(([line]) => JSON.parse(line));
}

const request = new Request("https://my.climbinglogbook.com/raven/log", { headers: { "cf-ray": "abc123-LHR" } });
const env = { APP_ENV: "production", CF_VERSION_METADATA: { id: "v-id", tag: "v2.99.0" } };

describe("createLogger (#1030)", () => {
  it("writes one JSON object per call with the request's context", () => {
    const lines = captured("warn");
    createLogger({ request, env, route: "/:username/log" }).warn("sync.push.rejected", { status: 409, userId: "u1" });
    expect(lines()).toEqual([
      {
        event: "sync.push.rejected",
        level: "warn",
        env: "production",
        version: "v2.99.0",
        ray: "abc123-LHR",
        method: "GET",
        route: "/:username/log",
        status: 409,
        userId: "u1",
      },
    ]);
  });

  it("redacts every field that isn't on the allowlist, including personal and health data", () => {
    const lines = captured("log");
    createLogger({ env }).info("test.event", {
      email: "nix@example.com",
      password: "hunter2",
      token: "t",
      cookie: "c",
      notes: "my knee hurts",
      painMoves: [{ limb: "knee" }],
    });
    const [line] = lines();
    for (const key of ["email", "password", "token", "cookie", "notes", "painMoves"])
      expect(line[key]).toBe("[redacted]");
    expect(JSON.stringify(line)).not.toMatch(/nix@example|hunter2|knee/);
  });

  it("serialises errors to name, message and stack", () => {
    const lines = captured("error");
    createLogger({ env }).error("request.unhandled", { err: new TypeError("boom") });
    expect(lines()[0].err).toMatchObject({
      name: "TypeError",
      message: "boom",
      stack: expect.stringContaining("boom"),
    });
  });

  it("falls back to the version id, and to dev outside a deployment", () => {
    const lines = captured("log");
    createLogger({ env: { CF_VERSION_METADATA: { id: "v-id", tag: "" } } }).info("a");
    createLogger({}).info("b");
    expect(lines().map(line => [line.version, line.env])).toEqual([
      ["v-id", "development"],
      ["dev", "development"],
    ]);
  });
});

describe("routeTemplate", () => {
  const RESOURCES = ["/-/api/entries", "/-/api/settings"];
  const template = (url, resources = RESOURCES) => routeTemplate(new URL(url), resources);

  it("names routes by template, never by a username, id or token", () => {
    expect(template("https://my.climbinglogbook.com/raven/log")).toBe("/:username/log");
    expect(template("https://my.climbinglogbook.com/raven/performance/pyramid")).toBe("/:username/performance/pyramid");
    expect(template("https://my.climbinglogbook.com/raven")).toBe("/:username");
    expect(template("https://my.climbinglogbook.com/-/api/public/raven/entries")).toBe(
      "/-/api/public/:username/entries",
    );
    expect(template("https://climbinglogbook.com/-/api/auth/sign-in/email")).toBe("/-/api/auth/sign-in/:param");
    expect(template("https://climbinglogbook.com/-/api/auth/reset-password/Abc123Token")).toBe(
      "/-/api/auth/reset-password/:param",
    );
    expect(template("https://admin.climbinglogbook.com/-/api/admin/users/u-123/logbook")).toBe(
      "admin /-/api/admin/users/:id/logbook",
    );
    expect(template("https://my.climbinglogbook.com/-/api/entries")).toBe("/-/api/entries");
    expect(template("https://climbinglogbook.com/help/terms/")).toBe("other");
  });
});
