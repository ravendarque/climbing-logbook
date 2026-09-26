import { describe, expect, it } from "vitest";
import { SHELL_PATHS, matchOwnerRoute } from "../../shared/owner-routes.js";

const PRE_958_REGEX = /^\/([^/]+)\/(log|map|performance(?:\/(?:pyramid|injury|strengths|trends|gap|rpe))?|sync|account(?:\/edit|\/import)?)\/?$/;

const PAGES = Object.keys(SHELL_PATHS);
const ADDED_SINCE_958 = ["account/beta"];

describe("matchOwnerRoute (#958)", () => {
  it("matches every owner page, with and without one trailing slash", () => {
    for (const page of PAGES) {
      expect(matchOwnerRoute(`/devuser/${page}`)).toEqual({ username: "devuser", page });
      expect(matchOwnerRoute(`/devuser/${page}/`)).toEqual({ username: "devuser", page });
    }
  });

  it("returns the username exactly as it appears in the URL (not decoded)", () => {
    expect(matchOwnerRoute("/j%C3%B6rg/log")).toEqual({ username: "j%C3%B6rg", page: "log" });
  });

  it.each([
    "",
    "/",
    "/devuser",
    "/devuser/",
    "//log",
    "/devuser//log",
    "/devuser/log//",
    "/devuser/log/extra",
    "/devuser/performance/grades",
    "/devuser/account/display",
    "/devuser/settings",
    "/devuser/LOG",
    "/help/",
    "/help/working-offline/",
    "/login/",
    "/-/api/entries",
    "/-/log-app.js",
    "devuser/log",
  ])("does not match %j", (pathname) => {
    expect(matchOwnerRoute(pathname)).toBeNull();
  });

  it("does not match inherited object keys as pages", () => {
    expect(matchOwnerRoute("/devuser/constructor")).toBeNull();
    expect(matchOwnerRoute("/devuser/__proto__")).toBeNull();
    expect(matchOwnerRoute("/devuser/hasOwnProperty")).toBeNull();
  });

  it("agrees with the pre-#958 regex on every path in the corpus", () => {
    const usernames = ["devuser", "a", "j%C3%B6rg", "user.name", "user-name_1"];
    const pre958Pages = PAGES.filter(p => !ADDED_SINCE_958.includes(p));
    const suffixes = [...pre958Pages, ...pre958Pages.map(p => `${p}/`), "", "/", "performance/grades", "account/display", "log/extra", "log//", "/log", "settings", "constructor"];
    const corpus = [];
    for (const u of usernames) for (const s of suffixes) corpus.push(`/${u}/${s}`);
    corpus.push("", "/", "//log", "/help/", "/login/", "/-/api/entries");

    for (const pathname of corpus) {
      const old = pathname.match(PRE_958_REGEX);
      const expected = old ? { username: old[1], page: old[2] } : null;
      expect(matchOwnerRoute(pathname), pathname).toEqual(expected);
    }
  });
});
