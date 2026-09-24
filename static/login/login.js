// Minimal login bridge (#320) -- posts straight to Better Auth's own
// sign-in/email endpoint. No client/store.js dependency: this page is
// intentionally outside the main app's module graph (see index.html's
// own header comment), a real browser form submit needs no Origin
// header handling of its own -- the browser sends one automatically for
// same-origin requests, unlike the Node-side scripts in
// scripts/lib/dev-session.mjs that have to set it by hand.
//
import { needsChannelChoice, resolvePostLoginTarget } from "./resolve-app-origin.js";

const RESET_PASSWORD_URL = `${window.location.origin}/reset-password/`;

const form = document.getElementById("login-form");
const errorEl = document.getElementById("login-error");
const infoEl = document.getElementById("login-info");
const submitBtn = document.getElementById("login-submit-btn");
const emailInput = document.getElementById("email");
const forgotPasswordBtn = document.getElementById("forgot-password-btn");

// #806 -- errorEl carries role="alert"/aria-live="assertive" in the
// template (views/login/index.njk), so a screen reader announces it
// once its text/visibility change; tabindex="-1" (template) makes it
// programmatically focusable so a sighted keyboard user also notices
// it, not just whoever's already looking at the right part of the page.
function showError(message) {
  errorEl.textContent = message;
  errorEl.hidden = false;
  errorEl.focus();
}

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
      //
      // #443/#547, ADR-0020 -- an opted-in user lands on beta.x instead,
      // a one-time check right here at the login-landing moment, not a
      // per-request check added to /log itself. The sign-in response
      // above only carries Better Auth's own user/session fields, not
      // this app's separate settings table, so this is a second request
      // -- the session cookie sign-in just set is already attached
      // automatically (same-origin fetch, right after the response that
      // set it). A failed/slow settings read falls back to my.x, the
      // same safe default a never-decided or opted-out user gets.
      //
      // #955, ADR-0029 -- on an app host (my.x/beta.x) this page was
      // reached from the app itself, so the settings read is skipped and
      // the visitor goes back to returnTo (when it's one of their own
      // pages) or their own /log, on this same origin.
      let betaOptIn = null;
      if (needsChannelChoice(window.location.hostname)) {
        try {
          const settingsRes = await fetch("/logbook/api/settings");
          betaOptIn = (await settingsRes.json()).betaOptIn;
        } catch {
          // Network hiccup reading settings -- resolveAppOrigin's own null
          // handling (never-decided) falls back to my.x, same safe default.
        }
      }
      // #960 -- on an app host, record who's signed in on this device (the
      // same key client/user-storage.js's SIGNED_IN_USER_KEY names), so the
      // app's page-side ownership check knows them straight away, offline
      // included. The apex is a different origin: nothing to record there.
      if (!needsChannelChoice(window.location.hostname)) {
        try { localStorage.setItem("logbook_signed_in_user", data.user.username.toLowerCase()); } catch { /* storage blocked */ }
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

// #22 -- reuses the email field already on this page rather than a
// separate "forgot password" page for one action. redirectTo points at
// ../reset-password/, the page Better Auth's own /reset-password/:token
// GET handler redirects to once it's validated the emailed token (see
// that page's own header comment).
forgotPasswordBtn.addEventListener("click", async () => {
  errorEl.hidden = true;
  infoEl.hidden = true;

  if (!emailInput.value) {
    // Focuses the actual field needing input rather than the error text
    // itself (showError()'s own default) -- still announced via
    // aria-live either way, just a more useful landing spot for a
    // keyboard user here specifically.
    showError("Enter your email above first, then click \"Forgot password?\" again.");
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
      showError(data?.message || `Request failed (${res.status}).`);
    }
  } catch {
    showError("Network error -- check your connection and try again.");
  } finally {
    forgotPasswordBtn.disabled = false;
  }
});
