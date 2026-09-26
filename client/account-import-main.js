// Not queued offline: an import needs the server to resolve places and validate every row.
import { createStore } from "./store.js";
import { createAdminAuth } from "./admin-auth.js";
import { createDisclosure } from "./modal-utils.js";
import { createThemeToggle } from "./theme-toggle.js";
import { syncAdminBar } from "./admin-bar.js";
import { buildTemplateCsv } from "../shared/csv-import.js";
import { loginPageUrl } from "./login-url.js";
import { pageAllowsBoot } from "./boot-gate.js";
import { registerServiceWorker } from "./register-sw.js";

const SETTINGS_URL = "/-/api/settings";
const IMPORT_URL = "/-/api/entries/import";

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

document.getElementById("download-template-btn").addEventListener("click", () => {
  const blob = new Blob([buildTemplateCsv()], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "climbing-logbook-import-template.csv";
  a.click();
  URL.revokeObjectURL(url);
});

const importForm = document.getElementById("import-form");
const importFileInput = document.getElementById("import-file-input");
const importSubmitBtn = document.getElementById("import-submit-btn");
const importStatus = document.getElementById("import-status");
const importErrors = document.getElementById("import-errors");
const importErrorsList = document.getElementById("import-errors-list");
const importSuccess = document.getElementById("import-success");
const importSuccessMessage = document.getElementById("import-success-message");

function resetImportPanels() {
  importStatus.hidden = true;
  importErrors.hidden = true;
  importErrorsList.replaceChildren();
  importSuccess.hidden = true;
}

function showRowErrors(errors) {
  importErrorsList.replaceChildren(...errors.map(({ row, error }) => {
    const li = document.createElement("li");
    li.textContent = row ? `Row ${row}: ${error}` : error;
    return li;
  }));
  importErrors.hidden = false;
}

importForm.addEventListener("submit", async e => {
  e.preventDefault();
  const file = importFileInput.files[0];
  if (!file) return;

  resetImportPanels();
  importSubmitBtn.disabled = true;
  importStatus.textContent = "Validating and importing…";
  importStatus.hidden = false;

  // By extension: browsers' MIME type for a local .json file is unreliable.
  const contentType = file.name.toLowerCase().endsWith(".json") ? "application/json" : "text/csv";

  try {
    const res = await adminFetch(IMPORT_URL, {
      method: "POST",
      headers: { "Content-Type": contentType },
      body: await file.text(),
    });
    if (isAuthRedirect(res)) { window.location.href = loginPageUrl(); return; }

    const data = await res.json();
    importStatus.hidden = true;
    if (!res.ok) {
      showRowErrors(data.errors ?? [{ error: data.error ?? `Error ${res.status}` }]);
      return;
    }

    importSuccessMessage.textContent = `Imported ${data.imported} ${data.imported === 1 ? "entry" : "entries"}.`;
    importSuccess.hidden = false;
    importForm.reset();
  } catch {
    importStatus.hidden = true;
    showRowErrors([{ error: "Import failed -- check your connection and try again." }]);
  } finally {
    importSubmitBtn.disabled = false;
  }
});

async function boot() {
  await Promise.all([adminAuth.checkSession(), adminAuth.fetchSettings()]);
  updateAdminBar();
}

pageAllowsBoot().then(allowed => {
  if (!allowed) return;
  registerServiceWorker({ after: boot() });
});
