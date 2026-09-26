// One ?v= per build for stable-named assets; production builds rewrite it to each file's content hash afterwards.
import eleventyNavigationPlugin from "@11ty/eleventy-navigation";
import { execFileSync } from "node:child_process";
import { minifyStaticScripts } from "./scripts/minify-static.mjs";
import { gradeScaleMatrixHtml, gradeScaleSourcesHtml } from "./client/grade-scale-matrix.js";

const ASSET_VERSION = String(Date.now());

export default function (eleventyConfig) {
  eleventyConfig.addGlobalData("assetVersion", ASSET_VERSION);
  eleventyConfig.addGlobalData("copyrightYear", new Date().getFullYear());

  eleventyConfig.addPassthroughCopy({ static: "." });

  eleventyConfig.addPlugin(eleventyNavigationPlugin);

  eleventyConfig.addShortcode("gradeScaleMatrix", gradeScaleMatrixHtml);
  eleventyConfig.addShortcode("gradeScaleSources", gradeScaleSourcesHtml);

  // Pagefind indexes /help after a real build; skipped under --watch, where it would run on every save.
  eleventyConfig.on("eleventy.after", () => {
    if (process.env.ELEVENTY_RUN_MODE === "watch") return;
    const { before, after } = minifyStaticScripts("static", "public");
    console.log(`[minify-static] static/ scripts: ${before} -> ${after} bytes`);
    execFileSync("npx", ["pagefind", "--site", "public/help", "--output-path", "public/help/pagefind"], {
      stdio: "inherit",
    });
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
};
