// Composition root for /:username/account (#302) -- bundled by esbuild
// into public/logbook/account-app.js. A landing page listing the
// account section's own sub-pages ("Edit account details", #224's
// "Import entries", and #27's "Export entries" CSV/JSON buttons below;
// Display preferences is still listed as "Coming soon" in the shell's
// own static markup, not wired here -- no shared nav component between
// these yet, see owned-routes.js's own SHELL_PATHS comment for why).
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
import { loadResource } from "./fetch-json.js";
import { buildEntriesCsv, resolveExportRows } from "../shared/csv-import.js";
import { createBetaOptIn } from "./beta-opt-in.js";
import "./components/climbing-menu-bar.js";
import "./components/beta-opt-in-modal.js";

const ADMIN_SETTINGS_URL = "/logbook/api/admin/settings";
const DATA_URL = "/logbook/api/logbook";
const PLACES_URL = "/logbook/api/places";
const LOCATIONS_URL = "/logbook/api/locations";

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
document.getElementById("import-link").href = `/${encodeURIComponent(USERNAME)}/account/import`;
document.getElementById("back-to-logbook-link").href = `/${encodeURIComponent(USERNAME)}/log`;

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
// #443/#546 -- same hidden-until-session-confirmed treatment as the two
// rows above, but no aria-checked to sync (this is a modal trigger, not a
// switch) -- betaOptInStatus is the only other piece of state to reflect.
const betaOptInRow = document.getElementById("beta-opt-in-row");
const betaOptInStatus = document.getElementById("beta-opt-in-status");

function syncSettingsToggles() {
  const loggedIn = store.isLoggedIn();
  athleteModeRow.hidden = !loggedIn;
  publicLogbookRow.hidden = !loggedIn;
  betaOptInRow.hidden = !loggedIn;
  athleteModeToggle.setAttribute("aria-checked", String(adminAuth.isAthleteMode()));
  publicLogbookToggle.setAttribute("aria-checked", String(adminAuth.isLogbookPublic()));
  const betaChoice = adminAuth.getBetaOptIn();
  betaOptInStatus.hidden = betaChoice === null;
  betaOptInStatus.textContent = betaChoice === true ? "You're currently opted in." : betaChoice === false ? "You're currently opted out." : "";
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

// #443/#546 -- onDecided re-syncs the status line below the row, same
// callback syncSettingsToggles() already serves updateAdminBar() with.
const betaOptIn = createBetaOptIn({ adminAuth, onDecided: syncSettingsToggles });
document.getElementById("beta-opt-in-manage-btn").addEventListener("click", () => betaOptIn.open());

createDisclosure(document.getElementById("header-menu-btn"), document.getElementById("header-menu-popover"), "#header-menu-wrap");
createThemeToggle();

// #27 -- "a simple one-click process" (Raven's own call, unlike #224's
// import which needed a whole wizard page): no navigation, just fetch
// this user's own data (the same public GET endpoints every owned page
// already reads -- no new server endpoint needed at all, unlike import's
// write path) and trigger a client-side download. Lazily fetched on
// click, not during boot() -- most visits to this page never click
// either button, so there's no reason to pay for entries/places/
// locations on every page load just in case.
const exportError = document.getElementById("export-error");

function downloadFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function exportEntries(format) {
  exportError.hidden = true;
  try {
    const [entries, places, locations] = await Promise.all([
      loadResource(DATA_URL, "entries"),
      loadResource(PLACES_URL, "places"),
      loadResource(LOCATIONS_URL, "locations"),
    ]);
    const rows = resolveExportRows(entries, places, locations);
    if (format === "csv") {
      downloadFile("climbing-logbook-export.csv", buildEntriesCsv(rows), "text/csv");
    } else {
      downloadFile("climbing-logbook-export.json", JSON.stringify(rows, null, 2), "application/json");
    }
  } catch {
    exportError.textContent = "Export failed -- check your connection and try again.";
    exportError.hidden = false;
  }
}

document.getElementById("export-csv-btn").addEventListener("click", () => exportEntries("csv"));
document.getElementById("export-json-btn").addEventListener("click", () => exportEntries("json"));

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
