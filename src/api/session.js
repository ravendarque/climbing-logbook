import { isAuthed } from "../lib/auth.js";

export async function handleSession(request, env) {
  const loggedIn = await isAuthed(request, env);
  return new Response(JSON.stringify({ loggedIn }), {
    headers: { "Content-Type": "application/json" },
  });
}
