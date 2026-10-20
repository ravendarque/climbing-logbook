import { execFileSync } from "node:child_process";
import { APP_VERSION } from "../../shared/app-version.js";

// Deploys build from the release tag's commit, so its tag is the version; any other build is "dev" (#1500).
export function buildVersion(
  describe = () =>
    execFileSync("git", ["describe", "--tags", "--exact-match", "--match", "v*", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }),
) {
  try {
    const tag = describe().trim();
    return APP_VERSION.test(tag) ? tag : "dev";
  } catch {
    return "dev";
  }
}
