import { json } from "./json.js";
import { claimInviteAround } from "./beta-gate.js";
import { turnstileFailure } from "./turnstile.js";

function parseBody(text) {
  try {
    return JSON.parse(text) ?? {};
  } catch {
    return {};
  }
}

// Turnstile is checked here, once, before any invite lookup, so codes can't be tried without it (#1073).
// Better Auth is built only past it: its set-up work hangs a later request if this one returns first.
export async function handleSignUp(request, env, createAuth) {
  const bodyText = await request.text();
  const body = parseBody(bodyText);

  const failure = await turnstileFailure(env, body);
  if (failure) return json(failure, 403);

  // The body was read above, so it's sent again; the headers carry the client's IP and Origin (#1072).
  const forward = () => createAuth().handler(new Request(request, { body: bodyText }));
  if (env.BETA_GATE_ENABLED !== "true") return forward();
  return claimInviteAround(env, body, forward);
}
