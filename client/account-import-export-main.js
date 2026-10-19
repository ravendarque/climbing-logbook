import { createAccountShell } from "./account-shell.js";
import { startPage } from "./boot-gate.js";
import { loadResource } from "./fetch-json.js";
import { downloadFile } from "./download-file.js";
import { buildEntriesCsv, resolveExportRows } from "../shared/csv-import.js";
import "./components/climbing-import.js";

const { username: USERNAME, adminAuth, updateAdminBar } = createAccountShell();

document.getElementById("back-to-account-link").href = `/${encodeURIComponent(USERNAME)}/account`;

const exportError = document.getElementById("export-error");

async function exportEntries(format) {
  exportError.hidden = true;
  try {
    const [entries, places, locations] = await Promise.all([
      loadResource("/-/api/entries", "entries"),
      loadResource("/-/api/places", "places"),
      loadResource("/-/api/locations", "locations"),
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
