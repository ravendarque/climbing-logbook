import { createAuth } from "./auth.js";

// Resolves the calling request's Better Auth session (#297) -- returns
// the session's user id, or null if there isn't one. Used both to gate
// /admin/* writes (401 if null, see src/index.js) and to scope the
// public GET routes, where null just means "no user" -- an anonymous or
// logged-out caller sees an empty result rather than 401ing, since a
// multi-tenant app has no single global "the" owner to default to.
export async function resolveUserId(request, env) {
  const session = await createAuth(env).api.getSession({ headers: request.headers });
  return session?.user?.id ?? null;
}
