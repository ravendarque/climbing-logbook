// One form per field: resubmitting fields you didn't touch reads as risky.
import { authRequest } from "./auth-request.js";

function wireEditableRow({ prefix, onSubmit }) {
  const view = document.getElementById(`${prefix}-view`);
  const form = document.getElementById(`${prefix}-form`);
  const valueEl = document.getElementById(`${prefix}-value`);
  const editBtn = document.getElementById(`${prefix}-edit-btn`);
  const cancelBtn = document.getElementById(`${prefix}-cancel-btn`);
  const saveBtn = document.getElementById(`${prefix}-save-btn`);
  const errorEl = document.getElementById(`${prefix}-error`);
  const inputEl = document.getElementById(`${prefix}-input`);

  function open() {
    if (inputEl) inputEl.value = valueEl.textContent;
    errorEl.hidden = true;
    view.hidden = true;
    form.hidden = false;
  }
  function close() {
    form.hidden = true;
    view.hidden = false;
    form.reset();
  }

  editBtn.addEventListener("click", open);
  cancelBtn.addEventListener("click", close);

  form.addEventListener("submit", async e => {
    e.preventDefault();
    errorEl.hidden = true;
    saveBtn.disabled = true;
    try {
      const newValue = await onSubmit(new FormData(form));
      if (valueEl && newValue !== undefined) valueEl.textContent = newValue;
      close();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.hidden = false;
    } finally {
      saveBtn.disabled = false;
    }
  });
}

export function createDetailsSection({ username }) {
  wireEditableRow({
    prefix: "username",
    onSubmit: async formData => {
      const newUsername = formData.get("username");
      await authRequest("/update-user", { username: newUsername });
      // Navigate: every link on the page is built from the old username in the URL.
      location.href = `/${encodeURIComponent(newUsername)}/account/authentication`;
    },
  });

  wireEditableRow({
    prefix: "email",
    onSubmit: async formData => {
      await authRequest("/change-email", {
        newEmail: formData.get("email"),
        callbackURL: `/${encodeURIComponent(username)}/account/authentication`,
      });
      // A 200 means the confirmation link was sent, not that the email changed.
      const pending = document.getElementById("email-pending");
      pending.textContent = `Confirmation sent to ${formData.get("email")}. Your email won't change until you click the link.`;
      pending.hidden = false;
      return undefined;
    },
  });

  wireEditableRow({
    prefix: "password",
    onSubmit: async formData => {
      await authRequest("/change-password", {
        currentPassword: formData.get("currentPassword"),
        newPassword: formData.get("newPassword"),
      });
      return undefined;
    },
  });

  return {
    show(adminAuth) {
      document.getElementById("username-value").textContent = adminAuth.getUsername() ?? "";
      document.getElementById("email-value").textContent = adminAuth.getEmail() ?? "";
    },
  };
}
