import { buildTemplateCsv } from "../../shared/csv-import.js";
import { apiFetch, isUnauthorized } from "../api-fetch.js";
import { loginPageUrl } from "../login-url.js";
import { BACKGROUND_FETCH_TIMEOUT_MS } from "../sync-status-icon.js";

const IMPORT_URL = "/-/api/entries/import";

// Not queued offline: an import needs the server to resolve places and validate every row.
class ClimbingImport extends HTMLElement {
  #form;
  #fileInput;
  #submitBtn;
  #status;
  #errors;
  #errorsList;
  #success;
  #successMessage;

  connectedCallback() {
    if (this.#form) return;
    this.#form = this.querySelector("#import-form");
    this.#fileInput = this.querySelector("#import-file-input");
    this.#submitBtn = this.querySelector("#import-submit-btn");
    this.#status = this.querySelector("#import-status");
    this.#errors = this.querySelector("#import-errors");
    this.#errorsList = this.querySelector("#import-errors-list");
    this.#success = this.querySelector("#import-success");
    this.#successMessage = this.querySelector("#import-success-message");

    this.querySelector("#download-template-btn").addEventListener("click", () => this.#downloadTemplate());
    this.#form.addEventListener("submit", e => {
      e.preventDefault();
      this.#submit();
    });
  }

  #downloadTemplate() {
    const url = URL.createObjectURL(new Blob([buildTemplateCsv()], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "climbing-logbook-import-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  #reset() {
    this.#status.hidden = true;
    this.#errors.hidden = true;
    this.#errorsList.replaceChildren();
    this.#success.hidden = true;
  }

  #showErrors(errors) {
    this.#errorsList.replaceChildren(
      ...errors.map(({ row, error }) => {
        const li = document.createElement("li");
        li.textContent = row ? `Row ${row}: ${error}` : error;
        return li;
      }),
    );
    this.#errors.hidden = false;
  }

  async #submit() {
    const file = this.#fileInput.files[0];
    if (!file) return;

    this.#reset();
    this.#submitBtn.disabled = true;
    this.#status.textContent = "Validating and importing…";
    this.#status.hidden = false;

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
      this.#status.hidden = true;
      if (!res.ok) {
        this.#showErrors(data.errors ?? [{ error: data.error ?? `Error ${res.status}` }]);
        return;
      }

      this.#successMessage.textContent = `Imported ${data.imported} ${data.imported === 1 ? "entry" : "entries"}.`;
      this.#success.hidden = false;
      this.#form.reset();
      this.dispatchEvent(new CustomEvent("import-complete", { bubbles: true, detail: { imported: data.imported } }));
    } catch {
      this.#status.hidden = true;
      this.#showErrors([{ error: "Import failed -- check your connection and try again." }]);
    } finally {
      this.#submitBtn.disabled = false;
    }
  }
}

customElements.define("climbing-import", ClimbingImport);
