import { Resend } from "resend";
import { renderEmail } from "./email-template.js";
import { createLogger } from "./log.js";

const FROM_ADDRESS = "Climbing Logbook <myaccount@climbinglogbook.com>";

// Never throws: new Resend() throws synchronously without a key, which would break the whole auth request.
async function send(env, log, payload, link) {
  if (env.EMAIL_DELIVERY === "off") {
    log.info("email.skipped", { reason: "delivery off" });
    return;
  }
  // Local dev prints the link instead of sending; anywhere else that would put live tokens in logs (#1357).
  if (env.EMAIL_DELIVERY === "log") {
    if (env.APP_ENV !== "development") {
      log.warn("email.skipped", { reason: "log delivery outside development" });
      return;
    }
    console.log(`Email to ${payload.to}: ${payload.subject}\n  ${link}`);
    return;
  }
  try {
    const resend = new Resend(env.RESEND_API_KEY);
    const result = await resend.emails.send(payload);
    if (result.error) log.error("email.failed", { code: result.error.name });
  } catch (err) {
    log.error("email.failed", { err });
  }
}

const longDate = ms =>
  new Date(ms).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

const CHANGE_PASSWORD = "If this wasn't you, change your password straight away: someone has access to your account.";

// One email per account change that changes data (#1456). `url` is where the change can be seen or undone.
const ACCOUNT_NOTICES = {
  passkeyAdded: ({ url }) => ({
    subject: "A passkey was added to your account",
    paragraphs: [
      "Someone added a passkey to your Climbing Logbook account. A passkey lets you log in with your fingerprint, face or device PIN instead of your password and a code.",
    ],
    action: { label: "See your passkeys", url },
    note: "If this wasn't you, remove the passkey and change your password straight away: someone has access to your account.",
  }),
  passkeyRemoved: ({ url }) => ({
    subject: "A passkey was removed from your account",
    paragraphs: ["Someone removed a passkey from your Climbing Logbook account. It can't be used to log in any more."],
    action: { label: "See your passkeys", url },
    note: CHANGE_PASSWORD,
  }),
  usernameChanged: ({ url, username }) => ({
    subject: "Your username was changed",
    paragraphs: ["The username on your Climbing Logbook account is now:", { strong: username }],
    action: { label: "See your account", url },
    note: CHANGE_PASSWORD,
  }),
  passwordChanged: ({ url }) => ({
    subject: "Your password was changed",
    paragraphs: ["The password for your Climbing Logbook account was just changed."],
    action: { label: "See your account", url },
    note: "If this wasn't you, reset your password from the login page straight away: someone has access to your account.",
  }),
  emailChanged: ({ url, newEmail }) => ({
    subject: "Your email address was changed",
    paragraphs: [
      "The email address for your Climbing Logbook account was changed to:",
      { strong: newEmail },
      "We'll send account emails there from now on, so this is the last one to this address.",
    ],
    action: { label: "See your account", url },
    note: "If this wasn't you, tell us through Report an issue on the site straight away: someone has access to your account.",
  }),
  twoFactorOn: ({ url }) => ({
    subject: "Two-Factor Authentication (2FA) is on",
    paragraphs: [
      "2FA is now on for your Climbing Logbook account. You'll need a code from your authenticator app when you log in on a new device.",
    ],
    action: { label: "See your 2FA settings", url },
    note: CHANGE_PASSWORD,
  }),
  twoFactorOff: ({ url }) => ({
    subject: "Two-Factor Authentication (2FA) is off",
    paragraphs: ["2FA is now off for your Climbing Logbook account. You'll log in with just your password."],
    action: { label: "See your 2FA settings", url },
    note: "If this wasn't you, change your password straight away, then turn 2FA back on.",
  }),
  backupCodesRenewed: ({ url }) => ({
    subject: "You have new 2FA backup codes",
    paragraphs: ["New backup codes were made for your Climbing Logbook account. The old ones don't work any more."],
    action: { label: "See your 2FA settings", url },
    note: CHANGE_PASSWORD,
  }),
  accountDeleted: ({ url }) => ({
    subject: "Your account was deleted",
    paragraphs: [
      "Your Climbing Logbook account and everything in it has been deleted, on every device. This is the last email we'll send you.",
    ],
    action: { label: "Go to Climbing Logbook", url },
    note: "If this wasn't you, tell us through Report an issue on the site. We can't restore a deleted account.",
  }),
  healthDataOn: ({ url }) => ({
    subject: "Health data is on",
    paragraphs: [
      "You agreed to the Health Data Agreement, so you can now log health information on your Climbing Logbook account.",
    ],
    action: { label: "See your health data settings", url },
    note: CHANGE_PASSWORD,
  }),
  healthDataOff: ({ url }) => ({
    subject: "Health data is off",
    paragraphs: [
      "Health data is now off on your Climbing Logbook account, and all your health information has been deleted.",
    ],
    action: { label: "See your health data settings", url },
    note: CHANGE_PASSWORD,
  }),
};

export function createEmailSender(env, log) {
  log ??= createLogger({ env });
  function sendTemplated(to, subject, content) {
    const payload = { from: FROM_ADDRESS, to, subject, ...renderEmail({ title: subject, ...content }) };
    return send(env, log, payload, content.action?.url);
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
    sendAccountNotice(to, kind, details) {
      const { subject, ...content } = ACCOUNT_NOTICES[kind](details);
      return sendTemplated(to, subject, content);
    },
    sendTwoStepRecoveryLink(to, url) {
      return sendTemplated(to, "Switch off 2FA?", {
        paragraphs: [
          "Someone entered your password on Climbing Logbook, then said they've lost the device that makes your sign-in codes and their backup codes.",
          "If that was you, use the link below. 2FA switches off 7 days after you do. The wait is there so that someone who has your password can't switch it off quickly: you'll have a week to stop them.",
        ],
        action: { label: "Start the 7-day wait", url },
        note: "If this wasn't you, don't use the link, and change your password: someone knows it. The link stops working after 24 hours.",
      });
    },
    sendTwoStepRecoveryStarted(to, effectiveAt, url) {
      return sendTemplated(to, "2FA will switch off in 7 days", {
        paragraphs: [
          "2FA on your Climbing Logbook account will switch off on:",
          { strong: longDate(effectiveAt) },
          "After that you'll log in with just your password, and you can set 2FA up again in My account.",
        ],
        action: { label: "This wasn't me: cancel it", url },
        note: "If you didn't ask for this, cancel it and change your password: someone knows it.",
      });
    },
    sendTwoStepRecoveryCancelled(to, helpUrl) {
      return sendTemplated(to, "2FA stays on", {
        paragraphs: [
          "The request to switch off 2FA on your Climbing Logbook account has been cancelled. Nothing has changed: you still need a code to log in.",
        ],
        action: { label: "How 2FA works", url: helpUrl },
        note: "If you didn't cancel it, someone else has access to your email or your account. Change your password.",
      });
    },
    sendTwoStepSwitchedOff(to, helpUrl) {
      return sendTemplated(to, "2FA is off", {
        paragraphs: [
          "The 7-day wait has ended, and 2FA is now off on your Climbing Logbook account. You'll log in with just your password.",
          "To turn it back on, go to My account, then Two-Factor Authentication (2FA).",
        ],
        action: { label: "How 2FA works", url: helpUrl },
        note: "If you didn't ask for this, change your password straight away, then turn 2FA back on.",
      });
    },
  };
}
