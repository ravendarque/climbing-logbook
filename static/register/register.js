// Registration (#22) -- posts straight to Better Auth's sign-up/email
// endpoint, same standalone-page pattern as ../login/login.js (outside
// client/main.js's module graph, no store.js dependency).
const form = document.getElementById("register-form");
const errorEl = document.getElementById("register-error");
const submitBtn = document.getElementById("register-submit-btn");
const codeInput = document.getElementById("code");
const successEl = document.getElementById("register-success");

// #806 -- errorEl carries role="alert"/aria-live="assertive" in the
// template (views/register/index.njk), so a screen reader announces it
// once its text/visibility change; tabindex="-1" (template) makes it
// programmatically focusable so a sighted keyboard user also notices it.
function showError(message) {
  errorEl.textContent = message;
  errorEl.hidden = false;
  errorEl.focus();
}

// Pre-fills the invite code from an invite link's `?code=` query param,
// e.g. climbinglogbook.com/register?code=abc123 -- still editable by
// hand if someone was just given a bare code instead of a full link.
const params = new URLSearchParams(window.location.search);
if (params.has("code")) codeInput.value = params.get("code");

// Turnstile (#311) -- explicit render, not implicit auto-scan, since the
// sitekey is a runtime decision: the real widget (infra/turnstile.tf) is
// domain-restricted to a fixed allowlist (#295 -- was ravendarque.com
// until this page moved to the apex here) and would never render/
// validate anywhere else. Everywhere that isn't on that allowlist (local
// dev, E2E, CI, PR previews) uses Cloudflare's own public "always passes"
// test sitekey instead -- there's no way, and no reason, for automated
// tests to solve a real challenge. REAL_SITEKEY is synced by infra.yml
// once infra/turnstile.tf provisions the widget, same placeholder
// pattern as wrangler.jsonc's KV/D1 ids -- not secret, sitekeys are
// meant to be embedded in client-side code. #932 -- beta.climbinglogbook.com
// added alongside the bare apex: beta is meant to behave the same as
// production, and infra/turnstile.tf's own `domains` list now includes
// it too -- both sides have to agree, or the client would pick the real
// sitekey while Cloudflare's own siteverify still rejects it as an
// unrecognized domain.
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

  // #311 -- window.turnstile is only defined once Cloudflare's api.js
  // (loaded async in index.html) has actually loaded; a slow connection
  // could reach here first. Either way, no token means the server-side
  // hook (server/lib/turnstile.js) would reject this anyway -- catching it
  // here just gives a clearer message than a generic sign-up failure.
  const turnstileToken = window.turnstile?.getResponse(turnstileWidgetId);
  if (!turnstileToken) {
    showError("Please complete the verification check.");
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
    showError(data?.message || `Sign-up failed (${res.status}).`);
  } catch {
    showError("Network error -- check your connection and try again.");
  } finally {
    submitBtn.disabled = false;
    // Turnstile tokens are single-use -- a failed submit (wrong invite
    // code, duplicate username, etc.) needs a fresh one for the retry,
    // or the server-side hook would reject an already-spent token even
    // once the actual form error is fixed.
    window.turnstile?.reset(turnstileWidgetId);
  }
});
