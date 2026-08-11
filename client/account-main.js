// Composition root for /:username/account (#302) -- bundled by esbuild
// into public/logbook/account-app.js. A landing page listing the
// account section's own sub-pages (just "Edit account details" for now;
// Display/Import/Export are listed as "Coming soon" in the shell's own
// static markup, not wired here -- no shared nav component between them
// yet, see owned-routes.js's own SHELL_PATHS comment for why).
//
// Reuses client/store.js/admin-auth.js unchanged (neither touches
// discipline-btn), but NOT client/header-chrome.js -- that factory's
// constructor unconditionally looks up discipline-btn/discipline-popover
// at creation time, and this page's <climbing-menu-bar no-discipline>
// never renders them (see that component's own comment: nothing on this
// page is discipline-scoped, so the picker would be present but inert).
// Theme toggle + header-menu disclosure + the menu divider are
// reimplemented narrowly instead, same "don't fight a coupled factory's
// assumptions" reasoning client/profile-main.js already established for
// this exact situation.
import { createStore } from "./store.js";
import { createAdminAuth } from "./admin-auth.js";
import { createDisclosure } from "./modal-utils.js";
import { createThemeToggle } from "./theme-toggle.js";
import { syncAdminBar } from "./admin-bar.js";
import "./components/climbing-menu-bar.js";
import "./components/climbing-tab-bar.js";

const ADMIN_SETTINGS_URL = "/logbook/api/admin/settings";

function adminFetch(url, options) {
  return fetch(url, { ...options, redirect: "manual" });
}
function isAuthRedirect(res) {
  return res.type === "opaqueredirect";
}

// /:username/account -- same single-segment extraction as every other
// composition root's USERNAME constant.
const USERNAME = location.pathname.split("/").filter(Boolean)[0] || "";

const store = createStore();

const tabBar = document.querySelector("climbing-tab-bar");
tabBar.setAttribute("username", USERNAME);

document.getElementById("edit-account-link").href = `/${encodeURIComponent(USERNAME)}/account/edit`;

// Same divider rule as client/header-chrome.js's own updateMenuDivider()
// (border only makes sense when Athlete Mode occupies the row above it),
// reimplemented directly rather than imported -- see this file's own
// header comment for why that factory can't be used here at all.
const athleteModeBtn = document.getElementById("athlete-mode-btn");
const headerMenuBottomRow = document.getElementById("header-menu-bottom-row");
function updateMenuDivider() {
  const hasTopContent = !athleteModeBtn.hidden;
  headerMenuBottomRow.classList.toggle("border-t", hasTopContent);
  headerMenuBottomRow.classList.toggle("pt-2", hasTopContent);
  headerMenuBottomRow.classList.toggle("mt-1", hasTopContent);
}

function updateAdminBar() {
  syncAdminBar({ store, adminAuth, headerChrome: { updateMenuDivider }, tabBar });
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

async function boot() {
  // No entries/places/locations fetch here -- unlike every other owned
  // page, nothing on this one is discipline- or data-scoped, so there's
  // nothing for adminAuth.resolveActiveType()'s has-entries heuristic to
  // apply to. checkSession()/fetchSettings() alone cover everything this
  // page's own admin bar (Athlete Mode/Public Logbook/login state) needs.
  await Promise.all([adminAuth.checkSession(), adminAuth.fetchSettings()]);
  updateAdminBar();
}

boot();
