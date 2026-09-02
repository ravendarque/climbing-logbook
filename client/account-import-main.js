// Composition root for /:username/account/import (#224 phases 2-4) --
// bundled by esbuild into public/logbook/account-import-app.js. Same "no
// header-chrome.js, reimplement narrowly" reasoning as
// client/account-main.js/account-edit-main.js (see either file's own
// header comment) -- this is a genuinely separate page/bundle, sharing no
// other code with them.
//
// Deliberately not part of the offline-sync architecture client/
// entry-form.js's own add/edit flow uses -- a bulk import needs a live
// round-trip to resolve locations/places server-side and validate every
// row before anything is written, so there's no meaningful way to queue
// one offline. A lapsed session or network failure here is just a
// displayed error, not a queued retry.
import { createStore } from "./store.js";
import { createAdminAuth } from "./admin-auth.js";
import { createDisclosure } from "./modal-utils.js";
import { createThemeToggle } from "./theme-toggle.js";
import { syncAdminBar } from "./admin-bar.js";
import { buildTemplateCsv } from "../shared/csv-import.js";

const ADMIN_SETTINGS_URL = "/logbook/api/admin/settings";
const IMPORT_URL = "/logbook/api/admin/logbook/import";
// Same cross-origin-in-production / same-origin-local-dev split as every
// other composition root's own copy of this check (see
// client/admin-auth.js's own LOGIN_PAGE_URL comment for why there isn't
// one shared constant yet) -- beta.climbinglogbook.com (#443/#548) added
// alongside my.climbinglogbook.com, found missing here the same way it
// was missing from owned-routes.js's own loginUrl() (caught by a failing
// test, not assumed).
const LOGIN_PAGE_URL = ["my.climbinglogbook.com", "beta.climbinglogbook.com", "ravendarque.com"].includes(window.location.hostname)
  ? "https://climbinglogbook.com/login/"
  : "/login/";

function adminFetch(url, options) {
  return fetch(url, { ...options, redirect: "manual" });
}
function isAuthRedirect(res) {
  return res.type === "opaqueredirect";
}

// /:username/account/import -- same single-segment extraction as every
// other composition root's USERNAME constant.
const USERNAME = location.pathname.split("/").filter(Boolean)[0] || "";

const store = createStore();

document.getElementById("back-to-account-link").href = `/${encodeURIComponent(USERNAME)}/account`;

// Same divider rule as client/header-chrome.js's own updateMenuDivider()
// (border only makes sense when menu-username occupies the row above it),
// reimplemented directly rather than imported -- see client/account-main.js's
// own header comment for why that factory can't be used on these pages.
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
  adminSettingsUrl: ADMIN_SETTINGS_URL,
  updateAdminBar,
});

createDisclosure(document.getElementById("header-menu-btn"), document.getElementById("header-menu-popover"), "#header-menu-wrap");
createThemeToggle();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/logbook/sw.js").catch(() => {});
}

// ── Step 1: template download ───────────────────────────────────────────
// No network round-trip -- the template is just CSV_COLUMNS's header row
// (shared/csv-import.js), generated and downloaded entirely client-side.
document.getElementById("download-template-btn").addEventListener("click", () => {
  const blob = new Blob([buildTemplateCsv()], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "climbing-logbook-import-template.csv";
  a.click();
  URL.revokeObjectURL(url);
});

// ── Step 2: upload + import ──────────────────────────────────────────────
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

  try {
    const res = await adminFetch(IMPORT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/csv" },
      body: await file.text(),
    });
    if (isAuthRedirect(res)) { window.location.href = LOGIN_PAGE_URL; return; }

    const data = await res.json();
    importStatus.hidden = true;
    if (!res.ok) {
      // Per-row validation failures (400 { errors: [...] }) and structural
      // failures (400 { error: "..." }, e.g. a header that doesn't match
      // the template) share the same list panel -- both are "here's what
      // to fix before re-uploading."
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

boot();
