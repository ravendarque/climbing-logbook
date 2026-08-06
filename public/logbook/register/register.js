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

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  errorEl.hidden = true;
  submitBtn.disabled = true;

  const email = document.getElementById("email").value;
  const username = document.getElementById("username").value;

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
  }
});
