// Three separate forms: resubmitting fields you didn't touch reads as risky.
import { createStore } from "./store.js";
import { createAdminAuth } from "./admin-auth.js";
import { createDisclosure } from "./modal-utils.js";
import { createThemeToggle } from "./theme-toggle.js";
import { syncAdminBar } from "./admin-bar.js";
import { pageAllowsBoot } from "./boot-gate.js";
import { registerServiceWorker } from "./register-sw.js";

const SETTINGS_URL = "/-/api/settings";
const AUTH_BASE = "/-/api/auth";

function adminFetch(url, options) {
  return fetch(url, { ...options, redirect: "manual" });
}
function isAuthRedirect(res) {
  return res.type === "opaqueredirect";
}

const USERNAME = location.pathname.split("/").filter(Boolean)[0] || "";

const store = createStore();

document.getElementById("back-to-account-link").href = `/${encodeURIComponent(USERNAME)}/account`;

const menuUsername = document.getElementById("menu-username");
const headerMenuBottomRow = document.getElementById("header-menu-bottom-row");
function updateMenuDivider() {
  const hasTopContent = !menuUsername.hidden;
  headerMenuBottomRow.classList.toggle("border-t", hasTopContent);
  headerMenuBottomRow.classList.toggle("pt-2", hasTopContent);
  headerMenuBottomRow.classList.toggle("mt-1", hasTopContent);
}

function updateAdminBar() {
  syncAdminBar({ store, adminAuth, headerChrome: { updateMenuDivider } });
}

const adminAuth = createAdminAuth({
  store, adminFetch, isAuthRedirect,
  settingsUrl: SETTINGS_URL,
  updateAdminBar,
});

createDisclosure(document.getElementById("header-menu-btn"), document.getElementById("header-menu-popover"), "#header-menu-wrap");
createThemeToggle();

async function authPost(path, body) {
  const res = await fetch(`${AUTH_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.message || `Request failed (${res.status}).`);
  return data;
}

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

wireEditableRow({
  prefix: "username",
  onSubmit: async formData => {
    const username = formData.get("username");
    await authPost("/update-user", { username });
    // Navigate: every link on the page is built from the old username in the URL.
    location.href = `/${encodeURIComponent(username)}/account/edit`;
  },
});

wireEditableRow({
  prefix: "email",
  onSubmit: async formData => {
    await authPost("/change-email", { newEmail: formData.get("email"), callbackURL: `/${encodeURIComponent(USERNAME)}/account/edit` });
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
    await authPost("/change-password", {
      currentPassword: formData.get("currentPassword"),
      newPassword: formData.get("newPassword"),
    });
    return undefined;
  },
});

async function boot() {
  await Promise.all([adminAuth.checkSession(), adminAuth.fetchSettings()]);
  document.getElementById("username-value").textContent = adminAuth.getUsername() ?? "";
  document.getElementById("email-value").textContent = adminAuth.getEmail() ?? "";
  updateAdminBar();
}

pageAllowsBoot().then(allowed => {
  if (!allowed) return;
  registerServiceWorker({ after: boot() });
});
