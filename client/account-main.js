// Not header-chrome.js: it requires the discipline picker, which this page doesn't have.
import { createStore } from "./store.js";
import { createAdminAuth } from "./admin-auth.js";
import { createDisclosure } from "./modal-utils.js";
import { createThemeToggle } from "./theme-toggle.js";
import { syncAdminBar } from "./admin-bar.js";
import { loadResource } from "./fetch-json.js";
import { buildEntriesCsv, resolveExportRows } from "../shared/csv-import.js";
import { pageAllowsBoot } from "./boot-gate.js";
import { registerServiceWorker } from "./register-sw.js";

const SETTINGS_URL = "/-/api/settings";
const DATA_URL = "/-/api/entries";
const PLACES_URL = "/-/api/places";
const LOCATIONS_URL = "/-/api/locations";

function adminFetch(url, options) {
  return fetch(url, { ...options, redirect: "manual" });
}
function isAuthRedirect(res) {
  return res.type === "opaqueredirect";
}

const USERNAME = location.pathname.split("/").filter(Boolean)[0] || "";

const store = createStore();

document.getElementById("edit-account-link").href = `/${encodeURIComponent(USERNAME)}/account/edit`;
document.getElementById("import-link").href = `/${encodeURIComponent(USERNAME)}/account/import`;
document.getElementById("beta-row").href = `/${encodeURIComponent(USERNAME)}/account/beta`;
document.getElementById("back-to-logbook-link").href = `/${encodeURIComponent(USERNAME)}/log`;

const menuUsername = document.getElementById("menu-username");
const headerMenuBottomRow = document.getElementById("header-menu-bottom-row");
function updateMenuDivider() {
  const hasTopContent = !menuUsername.hidden;
  headerMenuBottomRow.classList.toggle("border-t", hasTopContent);
  headerMenuBottomRow.classList.toggle("pt-2", hasTopContent);
  headerMenuBottomRow.classList.toggle("mt-1", hasTopContent);
}

const athleteModeRow = document.getElementById("athlete-mode-row");
const athleteModeToggle = document.getElementById("athlete-mode-toggle");
const publicLogbookRow = document.getElementById("public-logbook-row");
const publicLogbookToggle = document.getElementById("public-logbook-toggle");
const betaRow = document.getElementById("beta-row");
const betaStatus = document.getElementById("beta-status");

function syncSettingsToggles() {
  const loggedIn = store.isLoggedIn();
  athleteModeRow.hidden = !loggedIn;
  publicLogbookRow.hidden = !loggedIn;
  betaRow.hidden = !loggedIn;
  athleteModeToggle.setAttribute("aria-checked", String(adminAuth.isAthleteMode()));
  publicLogbookToggle.setAttribute("aria-checked", String(adminAuth.isLogbookPublic()));
  betaStatus.textContent = adminAuth.getBetaOptIn() ? "You're enrolled in the beta." : "You're not enrolled in the beta.";
}

// A failed save leaves the toggle at its last known state rather than flipping it.
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
  settingsUrl: SETTINGS_URL,
  updateAdminBar,
});

createDisclosure(document.getElementById("header-menu-btn"), document.getElementById("header-menu-popover"), "#header-menu-wrap");
createThemeToggle();

// Fetched on click: most visits never export.
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

async function boot() {
  await Promise.all([adminAuth.checkSession(), adminAuth.fetchSettings()]);
  updateAdminBar();
}

pageAllowsBoot().then(allowed => {
  if (!allowed) return;
  registerServiceWorker({ after: boot() });
});
