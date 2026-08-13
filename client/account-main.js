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

document.getElementById("edit-account-link").href = `/${encodeURIComponent(USERNAME)}/account/edit`;

// Same divider rule as client/header-chrome.js's own updateMenuDivider()
// (border only makes sense when menu-username occupies the row above it --
// #445 moved Athlete Mode off this menu, same "menu-username is the one
// real signal" fix header-chrome.js's own version already made),
// reimplemented directly rather than imported -- see this file's own
// header comment for why that factory can't be used here at all.
const menuUsername = document.getElementById("menu-username");
const headerMenuBottomRow = document.getElementById("header-menu-bottom-row");
function updateMenuDivider() {
  const hasTopContent = !menuUsername.hidden;
  headerMenuBottomRow.classList.toggle("border-t", hasTopContent);
  headerMenuBottomRow.classList.toggle("pt-2", hasTopContent);
  headerMenuBottomRow.classList.toggle("mt-1", hasTopContent);
}

// Athlete Mode/Public Logbook toggle rows (#445) -- this page is the one
// real consumer of adminAuth's setAthleteMode()/setLogbookPublic()
// mutators; no other composition root renders this UI at all. Both rows
// start `hidden` in markup and only appear once a real session is
// confirmed, same reasoning as menu-username/my-account-link.
const athleteModeRow = document.getElementById("athlete-mode-row");
const athleteModeToggle = document.getElementById("athlete-mode-toggle");
const publicLogbookRow = document.getElementById("public-logbook-row");
const publicLogbookToggle = document.getElementById("public-logbook-toggle");

function syncSettingsToggles() {
  const loggedIn = store.isLoggedIn();
  athleteModeRow.hidden = !loggedIn;
  publicLogbookRow.hidden = !loggedIn;
  athleteModeToggle.setAttribute("aria-checked", String(adminAuth.isAthleteMode()));
  publicLogbookToggle.setAttribute("aria-checked", String(adminAuth.isLogbookPublic()));
}

// Same disable-while-saving + title-on-failure shape admin-auth.js's own
// pre-#445 DOM-coupled click handlers used, carried over here since it's
// the one place that wiring still applies. setter's own updateAdminBar()
// callback (below) re-syncs aria-checked on success; a failed PATCH
// leaves the toggle showing its last-known-good state instead of
// optimistically flipping.
async function handleSettingToggle(btn, setter, label) {
  const next = btn.getAttribute("aria-checked") !== "true";
  btn.disabled = true;
  try {
    const result = await setter(next);
    btn.title = result.ok ? "" : `Failed to update ${label} (${result.status ?? "network error"})`;
  } catch (err) {
    btn.title = `Failed to update ${label}: ${err.message}`;
  } finally {
    btn.disabled = false;
  }
}

athleteModeToggle.addEventListener("click", () => handleSettingToggle(athleteModeToggle, adminAuth.setAthleteMode, "Athlete Mode"));
publicLogbookToggle.addEventListener("click", () => handleSettingToggle(publicLogbookToggle, adminAuth.setLogbookPublic, "Public Logbook"));

function updateAdminBar() {
  syncAdminBar({ store, adminAuth, headerChrome: { updateMenuDivider } });
  syncSettingsToggles();
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
