const form = document.getElementById("register-form");
const errorEl = document.getElementById("register-error");
const submitBtn = document.getElementById("register-submit-btn");
const codeInput = document.getElementById("code");
const successEl = document.getElementById("register-success");

function showError(message) {
  errorEl.textContent = message;
  errorEl.hidden = false;
  errorEl.focus();
}

const params = new URLSearchParams(window.location.search);
if (params.has("code")) codeInput.value = params.get("code");

// Cloudflare's always-passes test sitekey off the widget's domains; infra.yml syncs the real one.
const REAL_SITEKEY = "0x4AAAAAAEH3RghUN6KSc-uy";
const TEST_SITEKEY = "1x00000000000000000000AA";
const REAL_SITEKEY_HOSTNAMES = ["climbinglogbook.com", "beta.climbinglogbook.com"];
const sitekey = REAL_SITEKEY_HOSTNAMES.includes(window.location.hostname) ? REAL_SITEKEY : TEST_SITEKEY;

let turnstileWidgetId;
window.onTurnstileLoad = () => {
  turnstileWidgetId = window.turnstile.render("#turnstile-widget", { sitekey });
};

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  errorEl.hidden = true;
  submitBtn.disabled = true;

  const email = document.getElementById("email").value;
  const username = document.getElementById("username").value;

  const turnstileToken = window.turnstile?.getResponse(turnstileWidgetId);
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
    window.turnstile?.reset(turnstileWidgetId);
  }
});
