// Dev server only; production builds use vite.deploy.config.js. Not wrangler dev: it ignores my.
// hosts and rewrites the origin to the production route, which breaks Better Auth's origin check.
import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { CLIENT_ENTRIES } from "./vite.entries.mjs";

// Serves /-/<name>-app.js from source with HMR, so templates never know dev from prod.
function devEntryRewrite(entries) {
  return {
    name: "logbook-dev-entry-rewrite",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const match = req.url?.match(/^\/-\/([\w-]+)-app\.js$/);
        const source = match && entries[match[1]];
        if (source) req.url = `/${source}`;
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [cloudflare(), devEntryRewrite(CLIENT_ENTRIES)],
});
