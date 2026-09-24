// #961/#962, ADR-0028 -- the client build's final steps, in order, in one
// plugin: Rollup runs every plugin's writeBundle hook in parallel, so two
// separate plugins couldn't guarantee the service worker's BUILD_ID is
// computed from the HTML *after* its asset URLs got their content hashes.
//
// Scoped to the client environment: its writeBundle runs after Vite has
// written the client output and copied public/ into dist/client.
import { contentHashAssetUrls } from "./content-hash-asset-urls.mjs";
import { buildServiceWorker } from "./service-worker-build.mjs";

export function postBuildPlugin() {
  return {
    name: "logbook-post-build",
    applyToEnvironment: environment => environment.name === "client",
    async writeBundle(options, bundle) {
      contentHashAssetUrls(options.dir);
      await buildServiceWorker(options.dir, bundle);
    },
  };
}
