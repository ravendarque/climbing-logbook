// Chosen server-side: browsers read the manifest and touch icon before any script runs.
const BETA_VARIANTS = {
  "/-/manifest.json": "/-/beta/manifest.json",
  "/-/apple-touch-icon.png": "/-/beta/apple-touch-icon.png",
};

export const PER_HOST_ASSET_PATHS = Object.keys(BETA_VARIANTS);

export function perHostAssetPath(hostname, pathname) {
  if (!Object.hasOwn(BETA_VARIANTS, pathname)) return null;
  return hostname.startsWith("beta.") ? BETA_VARIANTS[pathname] : pathname;
}

export function handlePerHostAsset(request, env, assetPath) {
  return env.ASSETS.fetch(new Request(new URL(assetPath, request.url), request));
}
