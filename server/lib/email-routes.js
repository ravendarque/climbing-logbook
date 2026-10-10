import { json, readBody } from "./json.js";
import { emailLimitResponse } from "./email-limit.js";
import { turnstileFailure } from "./turnstile.js";

// Anyone can ask for a reset for any address, so it gets the bot check and the per-address limit (#1053).
export async function handlePasswordResetRequest(request, env, createAuth) {
  const { text, body } = await readBody(request);

  const failure = await turnstileFailure(env, body, "reset your password");
  if (failure) return json(failure, 403);
  const limited = await emailLimitResponse(env, body.email);
  if (limited) return limited;

  return createAuth().handler(new Request(request, { body: text }));
}

// Nothing in the app asks for this yet (#1335 adds the button). Without the bot check, a script could use up any
// address's allowance and block its password resets.
export async function handleVerificationResend(request, env, createAuth) {
  const { text, body } = await readBody(request);
  const failure = await turnstileFailure(env, body, "send another verification email");
  if (failure) return json(failure, 403);
  const limited = await emailLimitResponse(env, body.email);
  if (limited) return limited;
  return createAuth().handler(new Request(request, { body: text }));
}

// The confirmation goes to the address the account has now, so that's the address counted (#1053).
export async function handleChangeEmail(request, env, createAuth) {
  const auth = createAuth();
  if (env.RATE_LIMITING_ENABLED !== "true") return auth.handler(request);
  const session = await auth.api.getSession({ headers: request.headers, request, asResponse: false });
  const limited = await emailLimitResponse(env, session?.user?.email);
  if (limited) return limited;
  return auth.handler(request);
}
