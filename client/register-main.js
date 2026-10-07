import { TERMS_VERSION } from "../shared/terms.js";
import { renderTurnstile } from "./turnstile.js";

const form = document.getElementById("register-form");
const errorEl = document.getElementById("register-error");
const submitBtn = document.getElementById("register-submit-btn");
const codeInput = document.getElementById("code");
const successEl = document.getElementById("register-success");
const agreeTerms = document.getElementById("agree-terms");

function showError(message) {
  errorEl.textContent = message;
  errorEl.hidden = false;
  errorEl.focus();
}

const params = new URLSearchParams(window.location.search);
if (params.has("code")) codeInput.value = params.get("code");

const turnstile = renderTurnstile("#turnstile-widget");

form.addEventListener("submit", async event => {
  event.preventDefault();
  errorEl.hidden = true;
  submitBtn.disabled = true;

  const email = document.getElementById("email").value;
  const username = document.getElementById("username").value;

  if (!agreeTerms.checked) {
    showError("Agree to the terms of use to sign up.");
    submitBtn.disabled = false;
    return;
  }

  const turnstileToken = turnstile.getResponse();
  if (!turnstileToken) {
    showError("Please complete the verification check.");
    submitBtn.disabled = false;
    return;
  }

  try {
    const res = await fetch("/-/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        username,
        // Better Auth requires a name; this app collects only the username.
        name: username,
        password: document.getElementById("password").value,
        code: codeInput.value || undefined,
        turnstileToken,
        agreedTermsVersion: TERMS_VERSION,
      }),
    });

    if (res.ok) {
      // No session until the email is verified; a duplicate email looks the same, on purpose.
      form.hidden = true;
      document.getElementById("register-success-email").textContent = email;
      successEl.hidden = false;
      return;
    }

    const data = await res.json().catch(() => null);
    // Same wording for every policy rule, so it doesn't reveal which list a name is on.
    if (data?.code === "INVALID_USERNAME") {
      showError("That username isn't available. Try another.");
      return;
    }
    showError(data?.message || `Sign-up failed (${res.status}).`);
  } catch {
    showError("Network error -- check your connection and try again.");
  } finally {
    submitBtn.disabled = false;
    // Tokens are single-use, so every failed submit needs a fresh one.
    turnstile.reset();
  }
});
