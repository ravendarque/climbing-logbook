// This bundle replaces help-main.js on this page, so it wires the menu and theme too.
import { createDisclosure } from "./modal-utils.js";
import { createThemeToggle } from "./theme-toggle.js";
import { renderTurnstile } from "./turnstile.js";

createDisclosure(
  document.getElementById("header-menu-btn"),
  document.getElementById("header-menu-popover"),
  "#header-menu-wrap",
);
createThemeToggle();

const helpNav = document.getElementById("help-nav");
const helpNavBtn = document.getElementById("help-nav-btn");
helpNavBtn?.addEventListener("click", () => {
  const open = helpNav.toggleAttribute("data-open");
  helpNavBtn.setAttribute("aria-expanded", String(open));
});

const form = document.getElementById("report-issue-form");
const errorEl = document.getElementById("report-issue-error");
const submitBtn = document.getElementById("report-issue-submit-btn");
const successEl = document.getElementById("report-issue-success");
const messageEl = document.getElementById("report-issue-message");

function showError(message) {
  errorEl.textContent = message;
  errorEl.hidden = false;
  errorEl.focus();
}

const turnstile = renderTurnstile("#turnstile-widget");

// undefined, not "", so JSON.stringify omits it and the server sees it as absent.
const sourcePage = document.referrer || undefined;

form.addEventListener("submit", async event => {
  event.preventDefault();
  errorEl.hidden = true;
  submitBtn.disabled = true;

  // Names the field: the error sits well below it.
  if (!messageEl.value.trim()) {
    showError('Please fill in the "What happened?" field.');
    submitBtn.disabled = false;
    return;
  }

  const turnstileToken = turnstile.getResponse();
  if (!turnstileToken) {
    showError("Please complete the verification check.");
    submitBtn.disabled = false;
    return;
  }

  try {
    const res = await fetch("/-/api/report-issue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: messageEl.value,
        contactEmail: document.getElementById("report-issue-email").value || undefined,
        section: document.getElementById("report-issue-section").value || undefined,
        sourcePage,
        turnstileToken,
      }),
    });

    if (res.ok) {
      form.hidden = true;
      successEl.hidden = false;
      return;
    }

    const data = await res.json().catch(() => null);
    showError(data?.error || `Couldn't send your report (${res.status}).`);
  } catch {
    showError("Network error -- check your connection and try again.");
  } finally {
    submitBtn.disabled = false;
    // Tokens are single-use, so a failed submit needs a fresh one.
    turnstile.reset();
  }
});
