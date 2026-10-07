import { APIError } from "better-auth/api";
import { TERMS_VERSION } from "../../shared/terms.js";

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
