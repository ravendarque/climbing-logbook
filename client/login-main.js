import { needsChannelChoice, resolvePostLoginTarget } from "./resolve-app-origin.js";
import { redirectIfLoggedIn } from "./session-redirect.js";
import { SIGNED_IN_USER_KEY } from "./user-storage.js";
import { renderTurnstile } from "./turnstile.js";

redirectIfLoggedIn(document.getElementById("page-content"));

const RESET_PASSWORD_URL = `${window.location.origin}/reset-password/`;

const form = document.getElementById("login-form");
const errorEl = document.getElementById("login-error");
const infoEl = document.getElementById("login-info");
const submitBtn = document.getElementById("login-submit-btn");
const emailInput = document.getElementById("email");
const forgotPasswordBtn = document.getElementById("forgot-password-btn");
// Only a reset request is checked (#1053). Cloudflare's script loads once the page has, so it can't hold up sign-in.
const turnstile = renderTurnstile("#turnstile-widget");
window.addEventListener("load", () => {
  const script = document.createElement("script");
  script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad&render=explicit";
  script.async = true;
  document.head.append(script);
});

function showError(message) {
  errorEl.textContent = message;
  errorEl.hidden = false;
  errorEl.focus();
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  errorEl.hidden = true;
  infoEl.hidden = true;
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

    if (res.ok) {
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
          localStorage.setItem(SIGNED_IN_USER_KEY, data.user.username.toLowerCase());
        } catch {
          /* storage blocked */
        }
      }
      window.location.href = resolvePostLoginTarget({
        hostname: window.location.hostname,
        origin: window.location.origin,
        username: data.user.username,
        returnTo: new URLSearchParams(window.location.search).get("returnTo"),
        betaOptIn,
      });
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
