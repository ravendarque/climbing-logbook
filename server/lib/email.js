import { Resend } from "resend";
import { renderEmail } from "./email-template.js";

const FROM_ADDRESS = "Climbing Logbook <myaccount@climbinglogbook.com>";

// Never throws: new Resend() throws synchronously without a key, which would break the whole auth request.
async function send(env, payload) {
  if (env.EMAIL_DELIVERY === "off") {
    console.log(`[email] Delivery off, not sent: "${payload.subject}" to ${payload.to}`);
    return;
  }
  try {
    const resend = new Resend(env.RESEND_API_KEY);
    const result = await resend.emails.send(payload);
    if (result.error) console.error("[email] Resend returned an error:", result.error);
  } catch (err) {
    console.error("[email] Failed to send:", err);
  }
}

export function createEmailSender(env) {
  function sendTemplated(to, subject, content) {
    return send(env, { from: FROM_ADDRESS, to, subject, ...renderEmail({ title: subject, ...content }) });
  }

  return {
    sendVerificationEmail(to, url) {
      return sendTemplated(to, "Verify your email", {
        paragraphs: [
          "Welcome to Climbing Logbook. Confirm this is your email address to finish setting up your account.",
        ],
        action: { label: "Verify email", url },
        note: "If you didn't sign up, you can ignore this email.",
      });
    },
    sendPasswordResetEmail(to, url) {
      return sendTemplated(to, "Reset your password", {
        paragraphs: ["Someone asked to reset the password for your Climbing Logbook account."],
        action: { label: "Choose a new password", url },
        note: "If you didn't ask for this, you can ignore this email. Your password won't change.",
      });
    },
    // Goes to the current address, so a stolen session can't move the account silently.
    sendChangeEmailConfirmation(to, newEmail, url) {
      return sendTemplated(to, "Confirm your email change", {
        paragraphs: ["Someone asked to change your Climbing Logbook account's email address to:", { strong: newEmail }],
        action: { label: "Confirm the change", url },
        note: "If you didn't ask for this, you can ignore this email. Your email address won't change.",
      });
    },
  };
}
