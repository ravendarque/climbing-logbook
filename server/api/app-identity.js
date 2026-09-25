// #956, ADR-0029 -- Logbook Beta is its own installable app: beta.<domain>
// serves its own PWA identity (name, theme colour, icons) at the same URLs
// every shell already links, so the shells stay identical static HTML on
// every host. Two files differ per host: the manifest (Android and desktop
// installs) and the apple-touch-icon (iOS takes the home-screen icon from
// that link, not the manifest). Both paths are in wrangler.jsonc's
// run_worker_first so they reach this code; every other host gets the
// normal file unchanged.
//
// Why not two static files chosen by the page: the manifest and icon are
// read by the browser from the HTML it was served, before any page script
// runs, and iOS reads them at "Add to Home Screen" time -- a link swapped
// by JavaScript isn't reliably what gets installed.
const BETA_VARIANTS = {
  "/-/manifest.json": "/-/beta/manifest.json",
  "/-/apple-touch-icon.png": "/-/beta/apple-touch-icon.png",
};

export const PER_HOST_ASSET_PATHS = Object.keys(BETA_VARIANTS);

// The static file to serve for `pathname` on `hostname`, or null when
// `pathname` isn't one of the per-host files.
export function perHostAssetPath(hostname, pathname) {
  if (!Object.hasOwn(BETA_VARIANTS, pathname)) return null;
  return hostname.startsWith("beta.") ? BETA_VARIANTS[pathname] : pathname;
}

export function handlePerHostAsset(request, env, assetPath) {
  return env.ASSETS.fetch(new Request(new URL(assetPath, request.url), request));
}
