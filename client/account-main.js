// Not header-chrome.js: it requires the discipline picker, which this page doesn't have.
import { createAccountShell } from "./account-shell.js";
import { loadResource } from "./fetch-json.js";
import { buildEntriesCsv, resolveExportRows } from "../shared/csv-import.js";
import { startPage } from "./boot-gate.js";
import { removeDeviceData, unsyncedChangeCount } from "./device-data.js";
import { LOGIN_PATH } from "./login-url.js";

const DATA_URL = "/-/api/entries";
const PLACES_URL = "/-/api/places";
const LOCATIONS_URL = "/-/api/locations";

const {
  username: USERNAME,
  store,
  adminAuth,
  updateAdminBar,
} = createAccountShell({ onAdminBarUpdate: () => syncSettingsToggles() });

document.getElementById("edit-account-link").href = `/${encodeURIComponent(USERNAME)}/account/edit`;
document.getElementById("import-link").href = `/${encodeURIComponent(USERNAME)}/account/import`;
document.getElementById("beta-row").href = `/${encodeURIComponent(USERNAME)}/account/beta`;
document.getElementById("back-to-logbook-link").href = `/${encodeURIComponent(USERNAME)}/log`;

const athleteModeRow = document.getElementById("athlete-mode-row");
const athleteModeToggle = document.getElementById("athlete-mode-toggle");
const publicLogbookRow = document.getElementById("public-logbook-row");
const publicLogbookToggle = document.getElementById("public-logbook-toggle");
const betaRow = document.getElementById("beta-row");
const betaStatus = document.getElementById("beta-status");
const removeDataRow = document.getElementById("remove-data-row");

function syncSettingsToggles() {
  const loggedIn = store.isLoggedIn();
  athleteModeRow.hidden = !loggedIn;
  publicLogbookRow.hidden = !loggedIn;
  betaRow.hidden = !loggedIn;
  removeDataRow.hidden = !loggedIn;
  athleteModeToggle.setAttribute("aria-checked", String(adminAuth.isAthleteMode()));
  publicLogbookToggle.setAttribute("aria-checked", String(adminAuth.isLogbookPublic()));
  betaStatus.textContent = adminAuth.getBetaOptIn()
    ? "You're enrolled in the beta."
    : "You're not enrolled in the beta.";
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

athleteModeToggle.addEventListener("click", () =>
  handleSettingToggle(athleteModeToggle, adminAuth.setAthleteMode, "Athlete Mode"),
);
publicLogbookToggle.addEventListener("click", () =>
  handleSettingToggle(publicLogbookToggle, adminAuth.setLogbookPublic, "Public Logbook"),
);

const removeDataBtn = document.getElementById("remove-data-btn");
const removeDataWarning = document.getElementById("remove-data-warning");
const removeDataError = document.getElementById("remove-data-error");

document.getElementById("remove-data-log-link").href = `/${encodeURIComponent(USERNAME)}/log`;

function updateRemoveDataWarning() {
  const count = unsyncedChangeCount();
  removeDataWarning.hidden = count === 0;
  document.getElementById("remove-data-warning-text").textContent =
    count === 1
      ? "1 change hasn't synced yet. If you clear your data now, it will be lost."
      : `${count} changes haven't synced yet. If you clear your data now, they will be lost.`;
}

function showRemoveDataError(message) {
  removeDataError.textContent = message;
  removeDataError.hidden = false;
  removeDataBtn.disabled = false;
}

async function removeDataAndLogOut() {
  removeDataError.hidden = true;
  removeDataBtn.disabled = true;
  try {
    await adminAuth.signOut();
  } catch {
    showRemoveDataError("Couldn't log you out, so nothing was cleared. Check your connection and try again.");
    return;
  }
  if (await removeDeviceData(USERNAME)) {
    window.location.href = LOGIN_PATH;
    return;
  }
  showRemoveDataError(
    "You're logged out, but some of your data couldn't be cleared from this device. To clear the rest, clear this site's data in your browser's settings.",
  );
}

updateRemoveDataWarning();
window.addEventListener("storage", updateRemoveDataWarning);
removeDataBtn.addEventListener("click", removeDataAndLogOut);

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

startPage(boot);
