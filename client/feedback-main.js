// This bundle replaces help-main.js on this page, so it wires the menu and theme too.
import { createDisclosure } from "./modal-utils.js";
import { createThemeToggle } from "./theme-toggle.js";
import { turnstileSitekey } from "./turnstile-sitekey.js";

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

const form = document.getElementById("feedback-form");
const errorEl = document.getElementById("feedback-error");
const submitBtn = document.getElementById("feedback-submit-btn");
const successEl = document.getElementById("feedback-success");
const messageEl = document.getElementById("feedback-message");

function showError(message) {
  errorEl.textContent = message;
  errorEl.hidden = false;
  errorEl.focus();
}

const sitekey = turnstileSitekey(window.location.hostname);

let turnstileWidgetId;
window.onTurnstileLoad = () => {
  turnstileWidgetId = window.turnstile.render("#turnstile-widget", { sitekey });
};

const sourcePage = document.referrer || undefined;

form.addEventListener("submit", async event => {
  event.preventDefault();
  errorEl.hidden = true;
  submitBtn.disabled = true;

  if (!messageEl.value.trim()) {
    showError('Please fill in the "What do you think?" field.');
    submitBtn.disabled = false;
    return;
  }

  const turnstileToken = window.turnstile?.getResponse(turnstileWidgetId);
  if (!turnstileToken) {
    showError("Please complete the verification check.");
    submitBtn.disabled = false;
    return;
  }

  try {
    const res = await fetch("/-/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: messageEl.value,
        contactEmail: document.getElementById("feedback-email").value || undefined,
        section: document.getElementById("feedback-section").value || undefined,
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
    showError(data?.error || `Couldn't send your feedback (${res.status}).`);
  } catch {
    showError("Network error -- check your connection and try again.");
  } finally {
    submitBtn.disabled = false;
    // Tokens are single-use, so a failed submit needs a fresh one.
    window.turnstile?.reset(turnstileWidgetId);
  }
});
