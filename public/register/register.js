// Registration (#22) -- posts straight to Better Auth's sign-up/email
// endpoint, same standalone-page pattern as ../login/login.js (outside
// client/main.js's module graph, no store.js dependency).
const form = document.getElementById("register-form");
const errorEl = document.getElementById("register-error");
const submitBtn = document.getElementById("register-submit-btn");
const codeInput = document.getElementById("code");
const successEl = document.getElementById("register-success");

// Pre-fills the invite code from an invite link's `?code=` query param,
// e.g. climbinglogbook.com/register?code=abc123 -- still editable by
// hand if someone was just given a bare code instead of a full link.
const params = new URLSearchParams(window.location.search);
if (params.has("code")) codeInput.value = params.get("code");

// Turnstile (#311) -- explicit render, not implicit auto-scan, since the
// sitekey is a runtime decision: the real widget (infra/turnstile.tf) is
// domain-restricted to climbinglogbook.com (#295 -- was ravendarque.com
// until this page moved to the apex here) and would never render/
// validate anywhere else. Everywhere that isn't that real hostname (local
// dev, E2E, CI, PR previews) uses Cloudflare's own public "always passes"
// test sitekey instead -- there's no way, and no reason, for automated
// tests to solve a real challenge. REAL_SITEKEY is synced by infra.yml
// once infra/turnstile.tf provisions the widget, same placeholder
// pattern as wrangler.jsonc's KV/D1 ids -- not secret, sitekeys are
// meant to be embedded in client-side code.
const REAL_SITEKEY = "0x4AAAAAAEH3RghUN6KSc-uy";
const TEST_SITEKEY = "1x00000000000000000000AA";
const sitekey = window.location.hostname === "climbinglogbook.com" ? REAL_SITEKEY : TEST_SITEKEY;

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

  // #311 -- window.turnstile is only defined once Cloudflare's api.js
  // (loaded async in index.html) has actually loaded; a slow connection
  // could reach here first. Either way, no token means the server-side
  // hook (server/lib/turnstile.js) would reject this anyway -- catching it
  // here just gives a clearer message than a generic sign-up failure.
  const turnstileToken = window.turnstile?.getResponse(turnstileWidgetId);
  if (!turnstileToken) {
    errorEl.textContent = "Please complete the verification check.";
    errorEl.hidden = false;
    submitBtn.disabled = false;
    return;
  }

  try {
    const res = await fetch("/logbook/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        username,
        // Better Auth's core schema requires a display `name` separate
        // from the username plugin's own username/displayUsername
        // fields -- this app only ever collects one identity field at
        // signup (#22's own scope), so name just mirrors username
        // rather than asking for a 4th value nobody's asked for yet.
        name: username,
        password: document.getElementById("password").value,
        code: codeInput.value || undefined,
        turnstileToken,
      }),
    });

    if (res.ok) {
      // #308's requireEmailVerification means this never returns a
      // session -- no redirect into the app, just the "check your
      // email" state (also covers the anti-enumeration case: a
      // duplicate email 200s the same way, on purpose).
      form.hidden = true;
      document.getElementById("register-success-email").textContent = email;
      successEl.hidden = false;
      return;
    }

    const data = await res.json().catch(() => null);
    errorEl.textContent = data?.message || `Sign-up failed (${res.status}).`;
    errorEl.hidden = false;
  } catch {
    errorEl.textContent = "Network error -- check your connection and try again.";
    errorEl.hidden = false;
  } finally {
    submitBtn.disabled = false;
    // Turnstile tokens are single-use -- a failed submit (wrong invite
    // code, duplicate username, etc.) needs a fresh one for the retry,
    // or the server-side hook would reject an already-spent token even
    // once the actual form error is fixed.
    window.turnstile?.reset(turnstileWidgetId);
  }
});
