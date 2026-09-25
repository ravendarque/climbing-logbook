import { createAuth } from "./auth.js";

// Resolves the calling request's Better Auth session (#297) -- returns
// the session's user id, or null if there isn't one. server/index.js
// 401s every resource route (#992) when it's null and scopes the request
// to that user otherwise.
export async function resolveUserId(request, env) {
  const { hostname } = new URL(request.url);
  // #468 -- `request` alongside `headers` (better-auth's own suggested
  // fix, see the "Dynamic baseURL could not be resolved" APIError
  // message) so allowedHosts-based baseURL resolution can fall back to
  // the request's own URL when no Host header is present -- true for
  // vitest-pool-workers's in-process-constructed requests, never true for
  // a real Cloudflare-edge request. `asResponse: false` is required
  // alongside it -- better-auth's own default for asResponse is
  // `isRequestLike(request)` (context/to-auth-endpoints.mjs), so passing
  // `request` at all silently flips this call from "return the parsed
  // session object" to "return an HTTP Response", turning every session
  // lookup into a false null (confirmed empirically, 2026-08-15).
  const session = await createAuth(env, hostname).api.getSession({ headers: request.headers, request, asResponse: false });
  return session?.user?.id ?? null;
}
