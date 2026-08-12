// Composition root for /:username/account/edit (#302) -- bundled by
// esbuild into public/logbook/account-edit-app.js. Same "no
// header-chrome.js, reimplement narrowly" reasoning as
// client/account-main.js (see that file's own header comment) -- the two
// share no other code, this is a genuinely separate page/bundle, not a
// shared internal route within one.
//
// Three independently-submittable rows (username/email/password), each
// its own request against Better Auth's own update-user/change-password/
// change-email endpoints -- deliberately not one combined form. Raven's
// own call, 2026-08-11: resubmitting fields you didn't touch reads as
// risky even when harmless, and these three endpoints already don't
// depend on each other server-side (confirmed against the installed
// better-auth source), so the UI doesn't invent a dependency between them
// either. wireEditableRow() below is the one shared shape all three
// follow (view/form toggle, submit, disable-while-saving, error display);
// what actually happens on submit is each row's own callback.
import { createStore } from "./store.js";
import { createAdminAuth } from "./admin-auth.js";
import { createDisclosure } from "./modal-utils.js";
import { createThemeToggle } from "./theme-toggle.js";
import { syncAdminBar } from "./admin-bar.js";
import "./components/climbing-menu-bar.js";

const ADMIN_SETTINGS_URL = "/logbook/api/admin/settings";
const AUTH_BASE = "/logbook/api/auth";

function adminFetch(url, options) {
  return fetch(url, { ...options, redirect: "manual" });
}
function isAuthRedirect(res) {
  return res.type === "opaqueredirect";
}

// /:username/account/edit -- same single-segment extraction as every
// other composition root's USERNAME constant.
const USERNAME = location.pathname.split("/").filter(Boolean)[0] || "";

const store = createStore();

document.getElementById("back-to-account-link").href = `/${encodeURIComponent(USERNAME)}/account`;

const athleteModeBtn = document.getElementById("athlete-mode-btn");
const headerMenuBottomRow = document.getElementById("header-menu-bottom-row");
function updateMenuDivider() {
  const hasTopContent = !athleteModeBtn.hidden;
  headerMenuBottomRow.classList.toggle("border-t", hasTopContent);
  headerMenuBottomRow.classList.toggle("pt-2", hasTopContent);
  headerMenuBottomRow.classList.toggle("mt-1", hasTopContent);
}

function updateAdminBar() {
  syncAdminBar({ store, adminAuth, headerChrome: { updateMenuDivider } });
}

const adminAuth = createAdminAuth({
  store, adminFetch, isAuthRedirect,
  adminSettingsUrl: ADMIN_SETTINGS_URL,
  updateAdminBar,
});

createDisclosure(document.getElementById("header-menu-btn"), document.getElementById("header-menu-popover"), "#header-menu-wrap");
createThemeToggle();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/logbook/sw.js").catch(() => {});
}

// Posts straight to Better Auth's own endpoints, same standalone-request
// pattern as public/register/register.js -- `data?.message || fallback`
// on failure, same generic error-surfacing convention that file already
// established (Better Auth's APIError responses are always `{message,
// code}`, confirmed against the installed source during #379).
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

// Shared view/form toggle + submit/error/disable-while-saving shape for
// all three rows below -- see this file's own header comment for why
// they're not one combined form. onSubmit does the row's own request and
// returns the view's new text (or throws, shown in the row's own error
// paragraph).
function wireEditableRow({ prefix, onSubmit }) {
  const view = document.getElementById(`${prefix}-view`);
  const form = document.getElementById(`${prefix}-form`);
  const valueEl = document.getElementById(`${prefix}-value`);
  const editBtn = document.getElementById(`${prefix}-edit-btn`);
  const cancelBtn = document.getElementById(`${prefix}-cancel-btn`);
  const saveBtn = document.getElementById(`${prefix}-save-btn`);
  const errorEl = document.getElementById(`${prefix}-error`);

  function open() {
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
    // Full navigation, not an in-place display update -- every link on
    // this page (back-to-account, the menu bar's own My account link) is
    // built from this page's own URL segment (USERNAME above), which is
    // now stale the moment the username actually changes server-side.
    // Landing on the fresh URL re-derives all of them correctly, and
    // doubles as visible confirmation the change took.
    location.href = `/${encodeURIComponent(username)}/account/edit`;
  },
});

wireEditableRow({
  prefix: "email",
  onSubmit: async formData => {
    await authPost("/change-email", { newEmail: formData.get("email"), callbackURL: `/${encodeURIComponent(USERNAME)}/account/edit` });
    // This app always requires (and already has) a verified email
    // (requireEmailVerification: true, src/lib/auth.js), so change-email
    // always takes Better Auth's confirm-via-link branch server-side --
    // a 200 here never means the email actually changed yet, only that a
    // confirmation link was sent to the new address. The displayed email
    // deliberately isn't updated until that link is clicked (a real page
    // load against a different session, outside this bundle entirely).
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

boot();
