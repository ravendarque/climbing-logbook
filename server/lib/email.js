import { Resend } from "resend";
import { escapeHtml } from "./html-escape.js";

const FROM_ADDRESS = "Climbing Logbook <myaccount@climbinglogbook.com>";

// Never throws: new Resend() throws synchronously without a key, which would break the whole auth request.
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
    // Goes to the current address, so a stolen session can't move the account silently.
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
