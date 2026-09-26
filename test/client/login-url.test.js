import { describe, expect, it } from "vitest";
import { LOGIN_PATH, loginPageUrl } from "../../client/login-url.js";

describe("loginPageUrl", () => {
  it("is this origin's /login/, with the current path and query as returnTo", () => {
    expect(loginPageUrl({ pathname: "/raven/performance/rpe", search: "?window=90" }))
      .toBe("/-/login/?returnTo=%2Fraven%2Fperformance%2Frpe%3Fwindow%3D90");
  });

  it("round-trips through URLSearchParams to the original path", () => {
    const url = new URL(loginPageUrl({ pathname: "/j%C3%B6rg/log", search: "" }), "https://my.climbinglogbook.com");
    expect(url.pathname).toBe(LOGIN_PATH);
    expect(url.searchParams.get("returnTo")).toBe("/j%C3%B6rg/log");
  });
});
