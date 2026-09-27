// Not queued offline: an import needs the server to resolve places and validate every row.
import { createAccountShell } from "./account-shell.js";
import { buildTemplateCsv } from "../shared/csv-import.js";
import { loginPageUrl } from "./login-url.js";
import { startPage } from "./boot-gate.js";
import { apiFetch, isUnauthorized } from "./api-fetch.js";
import { BACKGROUND_FETCH_TIMEOUT_MS } from "./sync-status-icon.js";

const IMPORT_URL = "/-/api/entries/import";

const { username: USERNAME, adminAuth, updateAdminBar } = createAccountShell();

document.getElementById("back-to-account-link").href = `/${encodeURIComponent(USERNAME)}/account`;

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
  importErrorsList.replaceChildren(
    ...errors.map(({ row, error }) => {
      const li = document.createElement("li");
      li.textContent = row ? `Row ${row}: ${error}` : error;
      return li;
    }),
  );
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
    // Not the 10s save timeout: an import isn't idempotent, so abandoning one that later lands invites a duplicate.
    const res = await apiFetch(IMPORT_URL, {
      method: "POST",
      headers: { "Content-Type": contentType },
      body: await file.text(),
      signal: AbortSignal.timeout(BACKGROUND_FETCH_TIMEOUT_MS),
    });
    if (isUnauthorized(res)) {
      window.location.href = loginPageUrl();
      return;
    }

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

startPage(boot);
