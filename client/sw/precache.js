// Resumable and delta-aware, never addAll(): a flaky connection would lose everything so far.
import { classifyRequest } from "./classify.js";
import { isBuildCache } from "./caches.js";
import { isCacheableAsset, isCacheableShell, shellCacheKey } from "./responses.js";
import { matchOwnerRoute } from "../../shared/owner-routes.js";
import { DEMO_USERNAMES } from "../../shared/demo-personas.js";

const CONCURRENCY = 4;
// Same reason as index.js: a stored `Vary: Origin` mustn't hide a copy.
const MATCH = { ignoreVary: true };

// Never a demo account: with no session, its shells redirect to login.
export function precacheUsername(url) {
  const route = matchOwnerRoute(new URL(url).pathname);
  return route && !DEMO_USERNAMES.includes(route.username) ? route.username : null;
}

// Shells are stored by page but fetched via the owner URL: shell files aren't directly fetchable.
export function precacheItems(list, origin, username) {
  const assets = list.assets.map(({ url, hash }) => {
    const key = new URL(url, origin).href;
    const kind = classifyRequest({ url: key, method: "GET", mode: "no-cors", workerOrigin: origin }).kind;
    return { key, url, hash, immutable: kind === "immutable" };
  });
  const shells = username
    ? list.shells.map(({ page, hash }) => ({ key: shellCacheKey(page, origin), url: `/${username}/${page}`, page, hash }))
    : [];
  return [...shells, ...assets];
}

export async function sha256Hex(response) {
  const digest = await crypto.subtle.digest("SHA-256", await response.clone().arrayBuffer());
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

// Reused only when the URL is content-addressed or the bytes match the list's hash.
async function previousCopy(cachesImpl, currentName, item) {
  for (const name of await cachesImpl.keys()) {
    if (name === currentName || !isBuildCache(name)) continue;
    const hit = await (await cachesImpl.open(name)).match(item.key, MATCH);
    if (hit && (item.immutable || (item.hash && await sha256Hex(hit) === item.hash))) return hit;
  }
  return null;
}

// Resolves to { fetched, copied, missing } (lists of URLs). `missing` empty
// means the cache now holds every item.
export async function fillPrecache({ list, cacheName, origin, username, cachesImpl = caches, fetchImpl = fetch }) {
  const cache = await cachesImpl.open(cacheName);
  const result = { fetched: [], copied: [], missing: [] };

  async function fill(item) {
    if (await cache.match(item.key, MATCH)) return;
    const copy = await previousCopy(cachesImpl, cacheName, item);
    if (copy) {
      await cache.put(item.key, copy);
      result.copied.push(item.url);
      return;
    }
    try {
      // Only content-addressed files may come from the HTTP cache.
      const response = await fetchImpl(item.url, { credentials: "same-origin", cache: item.immutable ? "default" : "no-cache" });
      const cacheable = item.page ? isCacheableShell(response, item.page) : isCacheableAsset(response);
      if (!cacheable) throw new Error(`${item.url}: ${response.status}`);
      await cache.put(item.key, response);
      result.fetched.push(item.url);
    } catch {
      result.missing.push(item.url);
    }
  }

  const queue = precacheItems(list, origin, username);
  const worker = async () => {
    while (queue.length) await fill(queue.shift());
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return result;
}
