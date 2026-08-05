// Minimal login bridge (#320) -- posts straight to Better Auth's own
// sign-in/email endpoint. No client/store.js dependency: this page is
// intentionally outside the main app's module graph (see index.html's
// own header comment), a real browser form submit needs no Origin
// header handling of its own -- the browser sends one automatically for
// same-origin requests, unlike the Node-side scripts in
// scripts/lib/dev-session.mjs that have to set it by hand.
const REDIRECT_URL = "/logbook/";

const form = document.getElementById("login-form");
const errorEl = document.getElementById("login-error");
const submitBtn = document.getElementById("login-submit-btn");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  errorEl.hidden = true;
  submitBtn.disabled = true;

  try {
    const res = await fetch("/logbook/api/auth/sign-in/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: document.getElementById("email").value,
        password: document.getElementById("password").value,
      }),
    });

    if (res.ok) {
      window.location.href = REDIRECT_URL;
      return;
    }

    const data = await res.json().catch(() => null);
    errorEl.textContent = data?.message || `Login failed (${res.status}).`;
    errorEl.hidden = false;
  } catch {
    errorEl.textContent = "Network error -- check your connection and try again.";
    errorEl.hidden = false;
  } finally {
    submitBtn.disabled = false;
  }
});
