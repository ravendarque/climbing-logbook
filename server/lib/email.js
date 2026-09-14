import { Resend } from "resend";
import { escapeHtml } from "./html-escape.js";

// Transactional email (#308) -- signup verification + password reset,
// plus (#302) the change-email confirmation link.
//
// #754 -- url/newEmail are escapeHtml()'d before interpolation into the
// HTML body/href, even though neither is exploitable today (Better
// Auth's own Zod validation rejects HTML metacharacters in `newEmail`,
// and `url` is server-generated, never user-supplied) -- defense in
// depth against a future relaxed validation rule or template change
// silently reopening HTML/link injection into a transactional email
// sent to the account's real owner, found in review 2026-09-14.
const FROM_ADDRESS = "Climbing Logbook <myaccount@climbinglogbook.com>";

// Every send is wrapped in its own try/catch, deliberately never throwing
// or rejecting back to the caller -- confirmed live (#308) that Better
// Auth's own runInBackgroundOrAwait wrapper only protects against a
// rejected *promise*, not a *synchronous* throw, and `new Resend(...)`
// throws synchronously (not a rejected promise) when no API key is
// available at all. Without this, a missing/invalid RESEND_API_KEY would
// crash the entire request calling into Better Auth -- not just email
// sending -- since createAuth(env) itself would never even finish
// constructing. This is a real failure mode, not a hypothetical: it's
// exactly what broke CI here, since .dev.vars (this project's local-only
// source for RESEND_API_KEY) is gitignored and never present there.
async function send(apiKey, payload) {
  try {
    const resend = new Resend(apiKey);
    const result = await resend.emails.send(payload);
    if (result.error) console.error("[email] Resend returned an error:", result.error);
  } catch (err) {
    console.error("[email] Failed to send:", err);
  }
}

export function createEmailSender(env) {
  return {
    sendVerificationEmail(to, url) {
      const safeUrl = escapeHtml(url);
      return send(env.RESEND_API_KEY, {
        from: FROM_ADDRESS,
        to,
        subject: "Verify your email",
        html: `<p>Click the link below to verify your email address.</p><p><a href="${safeUrl}">${safeUrl}</a></p>`,
      });
    },
    sendPasswordResetEmail(to, url) {
      const safeUrl = escapeHtml(url);
      return send(env.RESEND_API_KEY, {
        from: FROM_ADDRESS,
        to,
        subject: "Reset your password",
        html: `<p>Click the link below to reset your password. If you didn't request this, you can ignore this email.</p><p><a href="${safeUrl}">${safeUrl}</a></p>`,
      });
    },
    // #302 -- sent to the CURRENT (already-verified) email address, not
    // the new one -- Better Auth's own changeEmail handler only takes
    // this branch when the account's existing email is verified
    // (server/lib/auth.js's user.changeEmail.sendChangeEmailConfirmation),
    // so this is the account-takeover check: if someone with a stolen
    // session tries to redirect the account to an address they control,
    // the real owner sees the request land in their own current inbox
    // rather than the change happening silently. The actual new-address
    // verification email is a separate Better Auth send once this link
    // is clicked, not this one.
    sendChangeEmailConfirmation(to, newEmail, url) {
      const safeUrl = escapeHtml(url);
      const safeNewEmail = escapeHtml(newEmail);
      return send(env.RESEND_API_KEY, {
        from: FROM_ADDRESS,
        to,
        subject: "Confirm your email change",
        html: `<p>Someone requested changing this account's email to <strong>${safeNewEmail}</strong>. Click the link below to confirm. If you didn't request this, you can ignore this email -- your email won't change.</p><p><a href="${safeUrl}">${safeUrl}</a></p>`,
      });
    },
  };
}
