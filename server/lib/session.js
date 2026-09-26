import { createAuth } from "./auth.js";

export async function resolveUserId(request, env) {
  const { hostname } = new URL(request.url);
  // request covers Host-less test requests; passing it flips the default to a Response.
  const session = await createAuth(env, hostname).api.getSession({ headers: request.headers, request, asResponse: false });
  return session?.user?.id ?? null;
}
