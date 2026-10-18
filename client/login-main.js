import { needsChannelChoice, resolvePostLoginTarget } from "./resolve-app-origin.js";
import { redirectIfLoggedIn } from "./session-redirect.js";
import { SIGNED_IN_USER_KEY } from "./user-storage.js";
import { resendVerificationEmail } from "./resend-verification.js";
import { renderTurnstile } from "./turnstile.js";
import { isCancelled, passkeyAutofillAvailable, passkeysSupported, signInWithPasskey } from "./passkeys.js";

const RECOVERY_TOKEN = new URLSearchParams(window.location.search).get("two-step-recovery");
if (!RECOVERY_TOKEN) redirectIfLoggedIn(document.getElementById("page-content"));

const RESET_PASSWORD_URL = `${window.location.origin}/reset-password/`;

const form = document.getElementById("login-form");
const errorEl = document.getElementById("login-error");
const infoEl = document.getElementById("login-info");
const submitBtn = document.getElementById("login-submit-btn");
const emailInput = document.getElementById("email");
const forgotPasswordBtn = document.getElementById("forgot-password-btn");
const resendEl = document.getElementById("login-resend");
const resendBtn = document.getElementById("resend-verification-btn");
// Only reset and resend requests are checked (#1053, #1335). Cloudflare's script loads after the page, so it can't hold up sign-in.
const turnstile = renderTurnstile("#turnstile-widget");
window.addEventListener("load", () => {
  const script = document.createElement("script");
  script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad&render=explicit";
  script.async = true;
  document.head.append(script);
});

async function finishLogin(user) {
  // The apex reads the beta setting to pick the landing host; an app host returns to returnTo or /log.
  let betaOptIn = null;
  if (needsChannelChoice(window.location.hostname)) {
    try {
      const settingsRes = await fetch("/-/api/settings");
      betaOptIn = (await settingsRes.json()).betaOptIn;
    } catch {}
  }
  // Recorded on app hosts so the offline ownership check knows this user straight away.
  if (!needsChannelChoice(window.location.hostname)) {
    try {
      localStorage.setItem(SIGNED_IN_USER_KEY, user.username.toLowerCase());
    } catch {
      /* storage blocked */
    }
  }
  window.location.href = resolvePostLoginTarget({
    hostname: window.location.hostname,
    origin: window.location.origin,
    username: user.username,
    returnTo: new URLSearchParams(window.location.search).get("returnTo"),
    betaOptIn,
  });
}

function showError(message) {
  errorEl.textContent = message;
  errorEl.hidden = false;
  errorEl.focus();
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  errorEl.hidden = true;
  infoEl.hidden = true;
  resendEl.hidden = true;
  submitBtn.disabled = true;

  try {
    const res = await fetch("/-/api/auth/sign-in/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: emailInput.value,
        password: document.getElementById("password").value,
      }),
    });

    const data = await res.json().catch(() => null);

    if (res.ok && data?.twoFactorRedirect) {
      showCodeStep();
      return;
    }
    if (res.ok) {
      await finishLogin(data.user);
      return;
    }

    if (data?.code === "EMAIL_NOT_VERIFIED") {
      showError("Verify your email address first, using the link we sent when you signed up.");
      resendEl.hidden = false;
      return;
    }
    showError(data?.message || `Login failed (${res.status}).`);
  } catch {
    showError("Network error -- check your connection and try again.");
  } finally {
    submitBtn.disabled = false;
  }
});

forgotPasswordBtn.addEventListener("click", async () => {
  errorEl.hidden = true;
  infoEl.hidden = true;

  if (!emailInput.value) {
    showError('Enter your email above first, then click "Forgot password?" again.');
    emailInput.focus();
    return;
  }

  forgotPasswordBtn.disabled = true;
  try {
    const turnstileToken = await turnstile.waitForResponse();
    if (!turnstileToken) {
      showError('Please complete the verification check, then click "Forgot password?" again.');
      return;
    }
    const res = await fetch("/-/api/auth/request-password-reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: emailInput.value, redirectTo: RESET_PASSWORD_URL, turnstileToken }),
    });
    const data = await res.json().catch(() => null);

    // Better Auth answers 200 whether or not the email exists; anything else is a real failure.
    if (res.ok) {
      infoEl.textContent = data?.message || "If that email is registered, a reset link has been sent.";
      infoEl.hidden = false;
    } else {
      showError(data?.message || `Request failed (${res.status}).`);
    }
  } catch {
    showError("Network error -- check your connection and try again.");
  } finally {
    forgotPasswordBtn.disabled = false;
    // Tokens are single-use, so every request needs a fresh one.
    turnstile.reset();
  }
});

emailInput.addEventListener("input", () => {
  resendEl.hidden = true;
});

resendBtn.addEventListener("click", async () => {
  errorEl.hidden = true;
  infoEl.hidden = true;
  resendBtn.disabled = true;
  const { ok, message } = await resendVerificationEmail(emailInput.value, turnstile);
  resendBtn.disabled = false;
  if (!ok) {
    showError(message);
    return;
  }
  resendEl.hidden = true;
  infoEl.textContent = message;
  infoEl.hidden = false;
});

const codeForm = document.getElementById("code-form");
const codeInput = document.getElementById("code");
const codeHint = document.getElementById("code-hint");
const codeError = document.getElementById("code-error");
const codeInfo = document.getElementById("code-info");
const codeSubmit = document.getElementById("code-submit-btn");
const useBackupBtn = document.getElementById("use-backup-code-btn");
const lostDeviceBtn = document.getElementById("lost-device-btn");
const lostDevice = document.getElementById("lost-device");
const recoveryBtn = document.getElementById("recovery-btn");
let usingBackupCode = false;

function showCodeStep() {
  form.hidden = true;
  codeForm.hidden = false;
  codeInput.focus();
}

function showCodeError(message) {
  codeError.textContent = message;
  codeError.hidden = false;
  codeError.focus();
}

useBackupBtn.addEventListener("click", () => {
  usingBackupCode = !usingBackupCode;
  codeInput.value = "";
  codeInput.inputMode = usingBackupCode ? "text" : "numeric";
  codeInput.maxLength = usingBackupCode ? 11 : 6;
  codeInput.removeAttribute("pattern");
  if (!usingBackupCode) codeInput.pattern = "[0-9]*";
  codeHint.textContent = usingBackupCode
    ? "Enter one of the backup codes you saved when you set up 2FA. Each one works once."
    : "Open your authenticator app and enter the 6-digit code for Climbing Logbook.";
  useBackupBtn.textContent = usingBackupCode ? "Use your authenticator app instead" : "Use a backup code instead";
  codeInput.focus();
});

codeForm.addEventListener("submit", async event => {
  event.preventDefault();
  codeError.hidden = true;
  codeSubmit.disabled = true;
  try {
    const res = await fetch(`/-/api/auth/two-factor/${usingBackupCode ? "verify-backup-code" : "verify-totp"}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: codeInput.value.trim(),
        trustDevice: document.getElementById("trust-device").checked,
      }),
    });
    const data = await res.json().catch(() => null);
    if (res.ok) {
      await finishLogin(data.user);
      return;
    }
    if (res.status === 401 && data?.code === "INVALID_TWO_FACTOR_COOKIE") {
      showCodeError("That took too long. Log in with your password again.");
      return;
    }
    showCodeError(
      usingBackupCode
        ? "That backup code didn't work. Check it and try again."
        : "That code didn't work. Check your authenticator app and try again.",
    );
  } catch {
    showCodeError("Network error -- check your connection and try again.");
  } finally {
    codeSubmit.disabled = false;
  }
});

lostDeviceBtn.addEventListener("click", () => {
  lostDevice.hidden = !lostDevice.hidden;
});

recoveryBtn.addEventListener("click", async () => {
  codeError.hidden = true;
  codeInfo.hidden = true;
  recoveryBtn.disabled = true;
  try {
    const res = await fetch("/-/api/auth/two-factor/recovery/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    const data = await res.json().catch(() => null);
    if (res.ok) {
      codeInfo.textContent = "We've emailed you a link. It works for 24 hours.";
      codeInfo.hidden = false;
      return;
    }
    showCodeError(data?.message || `Request failed (${res.status}).`);
  } catch {
    showCodeError("Network error -- check your connection and try again.");
  } finally {
    recoveryBtn.disabled = false;
  }
});

const recoveryPanel = document.getElementById("recovery-panel");
const recoveryStatus = document.getElementById("recovery-status");
const recoveryUnstarted = document.getElementById("recovery-unstarted");
const recoveryCancelBtn = document.getElementById("recovery-cancel-btn");
const recoveryError = document.getElementById("recovery-error");
const RECOVERY_MESSAGES = {
  expired: "This link has expired. Log in with your password and ask for a new one.",
  invalid: "This link isn't valid. Check you used the whole link from the email.",
  cancelled: "This was cancelled. 2FA stays on.",
  done: "2FA is already off. You can log in with just your password.",
};

const fullDate = ms =>
  new Date(ms).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

function showRecovery({ state, effectiveAt }) {
  recoveryUnstarted.hidden = state !== "unstarted";
  recoveryCancelBtn.hidden = !["unstarted", "waiting"].includes(state);
  if (state === "unstarted") recoveryStatus.textContent = "Someone asked to switch off 2FA on your account.";
  else if (state === "waiting")
    recoveryStatus.textContent = `2FA switches off on ${fullDate(effectiveAt)}. We've emailed you a link to cancel it.`;
  else recoveryStatus.textContent = RECOVERY_MESSAGES[state] ?? RECOVERY_MESSAGES.invalid;
}

async function recoveryAction(action) {
  recoveryError.hidden = true;
  try {
    const res = await fetch(`/-/api/auth/two-factor/recovery/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: RECOVERY_TOKEN }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.message || `Request failed (${res.status}).`);
    showRecovery(data);
  } catch (err) {
    recoveryError.textContent =
      err instanceof TypeError ? "Network error -- check your connection and try again." : err.message;
    recoveryError.hidden = false;
  }
}

if (RECOVERY_TOKEN) {
  form.hidden = true;
  recoveryPanel.hidden = false;
  document.getElementById("page-content").style.display = "";
  document.getElementById("recovery-start-btn").addEventListener("click", () => recoveryAction("start"));
  recoveryCancelBtn.addEventListener("click", () => recoveryAction("cancel"));
  recoveryAction("status");
}

const passkeyBtn = document.getElementById("passkey-login-btn");
let passkeyAutofill = null;

async function passkeyLogIn(autofill) {
  try {
    const user = await signInWithPasskey({ autofill, signal: passkeyAutofill?.signal });
    await finishLogin(user);
  } catch (err) {
    // Autofill is only an offer; it fails quietly, and only a pressed button reports a problem.
    if (autofill || isCancelled(err)) return;
    showError(err.message);
  }
}

if (!RECOVERY_TOKEN && passkeysSupported()) {
  passkeyBtn.hidden = false;
  passkeyBtn.addEventListener("click", async () => {
    passkeyAutofill?.abort();
    passkeyAutofill = null;
    errorEl.hidden = true;
    passkeyBtn.disabled = true;
    await passkeyLogIn(false);
    passkeyBtn.disabled = false;
  });
  passkeyAutofillAvailable().then(available => {
    if (!available) return;
    passkeyAutofill = new AbortController();
    passkeyLogIn(true);
  });
}
