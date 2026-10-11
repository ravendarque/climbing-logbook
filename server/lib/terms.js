import { APIError } from "better-auth/api";
import { TERMS_VERSION, termsUpdate } from "../../shared/terms.js";
import { json, parseJsonBody } from "./json.js";

export function requireTermsAgreement(body) {
  if (body?.agreedTermsVersion !== TERMS_VERSION) {
    throw new APIError("BAD_REQUEST", {
      message: "Agree to the terms of use to sign up.",
      code: "TERMS_NOT_AGREED",
    });
  }
}

export function stampTermsAgreement(user) {
  return { data: { ...user, termsVersion: TERMS_VERSION, termsAgreedAt: new Date() } };
}

// 428, not 403: the offline queue keeps the save and sends it once the terms are agreed.
export function refuseUntilTermsAgreed(user) {
  if (!termsUpdate(user.termsVersion)?.required) return null;
  return json({ error: "Agree to the updated terms of use to keep saving.", code: "TERMS_NOT_AGREED" }, 428);
}

export async function handleAgreeTerms(request, env, userId) {
  const parsed = await parseJsonBody(request);
  if (!parsed.ok) return parsed.response;
  if (typeof parsed.body?.version !== "string") return json({ error: "version must be a string" }, 400);
  if (parsed.body.version !== TERMS_VERSION) {
    return json(
      { error: "The terms of use have changed again. Reload the page to see them.", code: "TERMS_CHANGED" },
      409,
    );
  }
  await env.LOGBOOK_DB.prepare(`UPDATE "user" SET termsVersion = ?, termsAgreedAt = ? WHERE id = ?`)
    .bind(TERMS_VERSION, new Date().toISOString(), userId)
    .run();
  return new Response(null, { status: 204 });
}
