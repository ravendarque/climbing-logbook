// One ?v= per build for stable-named assets; production builds rewrite it to each file's content hash afterwards.
import eleventyNavigationPlugin from "@11ty/eleventy-navigation";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { minifyStaticScripts } from "./scripts/minify-static.mjs";
import { gradeScaleMatrixHtml, gradeScaleSourcesHtml } from "./client/grade-scale-matrix.js";
import { TERMS_HISTORY, TERMS_VERSION } from "./shared/terms.js";
import { whatsNew, whatsNewReleases } from "./scripts/lib/whats-new.mjs";
import { loadingSpinnerHtml } from "./client/loading-spinner.js";
import { buildVersion } from "./scripts/lib/build-version.mjs";

const ASSET_VERSION = String(Date.now());

export default function (eleventyConfig) {
  eleventyConfig.addGlobalData("assetVersion", ASSET_VERSION);
  eleventyConfig.addGlobalData("copyrightYear", new Date().getFullYear());
  eleventyConfig.addGlobalData("appVersion", buildVersion());
  const longDate = iso =>
    new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  eleventyConfig.addGlobalData("termsUpdated", longDate(TERMS_VERSION));
  eleventyConfig.addGlobalData(
    "termsHistory",
    TERMS_HISTORY.map(({ version, effective, changes }) => ({
      updated: longDate(version),
      effective: effective === version ? null : longDate(effective),
      changes,
    })).reverse(),
  );

  eleventyConfig.addGlobalData("whatsNew", () => whatsNew());
  eleventyConfig.addGlobalData("whatsNewReleases", () => whatsNewReleases());

  eleventyConfig.addPassthroughCopy({ static: "." });

  eleventyConfig.addPlugin(eleventyNavigationPlugin);

  eleventyConfig.addShortcode("gradeScaleMatrix", gradeScaleMatrixHtml);
  eleventyConfig.addShortcode("loadingSpinner", (label, compact = false) => loadingSpinnerHtml(label, { compact }));
  eleventyConfig.addShortcode("gradeScaleSources", gradeScaleSourcesHtml);

  // Under --watch, Pagefind indexes /help on the first build only: on every save it would slow each rebuild.
  let indexed = false;
  eleventyConfig.on("eleventy.after", ({ directories }) => {
    const watching = process.env.ELEVENTY_RUN_MODE === "watch";
    if (!watching) {
      const { before, after } = minifyStaticScripts("static", directories.output);
      console.log(`[minify-static] static/ scripts: ${before} -> ${after} bytes`);
    }
    if (watching && indexed) return;
    execFileSync(
      "npx",
      [
        "pagefind",
        "--site",
        join(directories.output, "help"),
        "--output-path",
        join(directories.output, "help", "pagefind"),
      ],
      {
        stdio: "inherit",
      },
    );
    indexed = true;
  });

  // Gates the Vite HMR client to dev: in production its 404 reads as a blocked module in Firefox.
  eleventyConfig.addGlobalData("isDevBuild", () => process.env.ELEVENTY_RUN_MODE === "watch");

  return {
    dir: {
      input: "views",
      output: "public",
      includes: "_includes",
    },
    templateFormats: ["njk", "md"],
    // njk, not liquid, so Markdown pages use the same engine.
    markdownTemplateEngine: "njk",
  };
}
