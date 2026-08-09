// Minimal login bridge (#320) -- posts straight to Better Auth's own
// sign-in/email endpoint. No client/store.js dependency: this page is
// intentionally outside the main app's module graph (see index.html's
// own header comment), a real browser form submit needs no Origin
// header handling of its own -- the browser sends one automatically for
// same-origin requests, unlike the Node-side scripts in
// scripts/lib/dev-session.mjs that have to set it by hand.
//
// Cross-origin in production (#295 -- this page moved to the apex,
// climbinglogbook.com) but same-origin everywhere else (local dev, PR
// previews) -- those don't have a real my.<domain> subdomain to send a
// browser to.
const APP_ORIGIN = window.location.hostname === "climbinglogbook.com" ? "https://my.climbinglogbook.com" : "";
const RESET_PASSWORD_URL = `${window.location.origin}/reset-password/`;

const form = document.getElementById("login-form");
const errorEl = document.getElementById("login-error");
const infoEl = document.getElementById("login-info");
const submitBtn = document.getElementById("login-submit-btn");
const emailInput = document.getElementById("email");
const forgotPasswordBtn = document.getElementById("forgot-password-btn");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  errorEl.hidden = true;
  infoEl.hidden = true;
  submitBtn.disabled = true;

  try {
    const res = await fetch("/logbook/api/auth/sign-in/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: emailInput.value,
        password: document.getElementById("password").value,
      }),
    });

    const data = await res.json().catch(() => null);

    if (res.ok) {
      // Redirects to the signed-in user's own /log page (#352) -- not a
      // fixed /logbook/ target, which was this page's original bug
      // (landed everyone on the same app-root URL regardless of who
      // signed in). Previously targeted the user's public profile page
      // (#113) instead of /log -- that was the only real page #348/#351
      // had built yet at the time; landing an owner on their own
      // read-only view right after logging in is exactly the friction
      // #352 removes now that /log exists.
      window.location.href = `${APP_ORIGIN}/${data.user.username}/log`;
      return;
    }

    errorEl.textContent = data?.message || `Login failed (${res.status}).`;
    errorEl.hidden = false;
  } catch {
    errorEl.textContent = "Network error -- check your connection and try again.";
    errorEl.hidden = false;
  } finally {
    submitBtn.disabled = false;
  }
});

// #22 -- reuses the email field already on this page rather than a
// separate "forgot password" page for one action. redirectTo points at
// ../reset-password/, the page Better Auth's own /reset-password/:token
// GET handler redirects to once it's validated the emailed token (see
// that page's own header comment).
forgotPasswordBtn.addEventListener("click", async () => {
  errorEl.hidden = true;
  infoEl.hidden = true;

  if (!emailInput.value) {
    errorEl.textContent = "Enter your email above first, then click \"Forgot password?\" again.";
    errorEl.hidden = false;
    emailInput.focus();
    return;
  }

  forgotPasswordBtn.disabled = true;
  try {
    const res = await fetch("/logbook/api/auth/request-password-reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: emailInput.value, redirectTo: RESET_PASSWORD_URL }),
    });
    const data = await res.json().catch(() => null);

    // Better Auth always 200s this endpoint regardless of whether the
    // email exists (anti-enumeration, same reasoning as sign-up's
    // duplicate-email behavior) -- its own message is already the right
    // generic wording, reused verbatim. A non-200 here is a genuine
    // failure (e.g. redirectTo not in trustedOrigins), not "email
    // doesn't exist" -- showing it as an error doesn't create an
    // enumeration oracle, since it's identical regardless of which email
    // was typed, but it does matter to actually surface real failures
    // rather than always claiming success.
    if (res.ok) {
      infoEl.textContent = data?.message || "If that email is registered, a reset link has been sent.";
      infoEl.hidden = false;
    } else {
      errorEl.textContent = data?.message || `Request failed (${res.status}).`;
      errorEl.hidden = false;
    }
  } catch {
    errorEl.textContent = "Network error -- check your connection and try again.";
    errorEl.hidden = false;
  } finally {
    forgotPasswordBtn.disabled = false;
  }
});
