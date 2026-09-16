// Reset-password landing page (#22) -- the redirectTo target
// ../login/login.js's "forgot password?" flow passes to Better Auth's
// request-password-reset. Better Auth's own /reset-password/:token GET
// handler validates the emailed token server-side *before* ever
// redirecting here, appending the result as a query param: `?token=...`
// on success, `?error=INVALID_TOKEN` if the link was bad/expired/already
// used -- this page never sees or validates the raw token itself, only
// what that handler decided.
const form = document.getElementById("reset-form");
const errorEl = document.getElementById("reset-error");
const submitBtn = document.getElementById("reset-submit-btn");
const invalidEl = document.getElementById("reset-invalid");
const successEl = document.getElementById("reset-success");

// #806 -- errorEl carries role="alert"/aria-live="assertive" in the
// template (views/reset-password/index.njk), so a screen reader
// announces it once its text/visibility change; tabindex="-1" (template)
// makes it programmatically focusable so a sighted keyboard user also
// notices it.
function showError(message) {
  errorEl.textContent = message;
  errorEl.hidden = false;
  errorEl.focus();
}

const params = new URLSearchParams(window.location.search);
const token = params.get("token");

if (!token) {
  form.hidden = true;
  invalidEl.hidden = false;
} else {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorEl.hidden = true;
    submitBtn.disabled = true;

    try {
      const res = await fetch("/logbook/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newPassword: document.getElementById("password").value,
          token,
        }),
      });

      if (res.ok) {
        form.hidden = true;
        successEl.hidden = false;
        return;
      }

      const data = await res.json().catch(() => null);
      showError(data?.message || `Reset failed (${res.status}).`);
    } catch {
      showError("Network error -- check your connection and try again.");
    } finally {
      submitBtn.disabled = false;
    }
  });
}
