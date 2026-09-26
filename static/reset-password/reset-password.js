// Better Auth validates the emailed token before redirecting here with ?token= or ?error=.
const form = document.getElementById("reset-form");
const errorEl = document.getElementById("reset-error");
const submitBtn = document.getElementById("reset-submit-btn");
const invalidEl = document.getElementById("reset-invalid");
const successEl = document.getElementById("reset-success");

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
      const res = await fetch("/-/api/auth/reset-password", {
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
