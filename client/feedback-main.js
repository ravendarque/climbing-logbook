// #925 -- own dedicated bundle (vite.entries.mjs), same "form only exists
// on this one page" reasoning as report-issue-main.js (#924). Identical
// Turnstile explicit-render + fetch/submit pattern, posting to
// /logbook/api/feedback (server/api/feedback.js) instead.
//
// bundle: feedback REPLACES help-main.js entirely (11ty's data cascade),
// so this page needs report-issue-main.js's own fix for the same gap
// (burger menu/theme toggle/mobile topic-list collapse otherwise dead) --
// see that file's own comment.
import { createDisclosure } from "./modal-utils.js";
import { createThemeToggle } from "./theme-toggle.js";

createDisclosure(document.getElementById("header-menu-btn"), document.getElementById("header-menu-popover"), "#header-menu-wrap");
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

// report-issue-main.js's own precedent -- errorEl carries role="alert"/
// aria-live="assertive" in the template, so a screen reader announces it
// once its text/visibility change; tabindex="-1" (template) makes it
// programmatically focusable so a sighted keyboard user also notices it.
function showError(message) {
  errorEl.textContent = message;
  errorEl.hidden = false;
  errorEl.focus();
}

// #311's own precedent -- the real widget (infra/turnstile.tf) is
// domain-restricted to a fixed allowlist; everywhere else (local dev,
// e2e, CI, PR previews) uses Cloudflare's own public "always passes"
// test sitekey instead. Duplicated (not shared) with report-issue-main.js's
// own identical constants -- that file's own comment explains why (Vite
// bundling means each entry gets its own copy either way).
const REAL_SITEKEY = "0x4AAAAAAEH3RghUN6KSc-uy";
const TEST_SITEKEY = "1x00000000000000000000AA";
const REAL_SITEKEY_HOSTNAMES = ["climbinglogbook.com", "beta.climbinglogbook.com"];
const sitekey = REAL_SITEKEY_HOSTNAMES.includes(window.location.hostname) ? REAL_SITEKEY : TEST_SITEKEY;

let turnstileWidgetId;
window.onTurnstileLoad = () => {
  turnstileWidgetId = window.turnstile.render("#turnstile-widget", { sitekey });
};

// report-issue-main.js's own precedent -- document.referrer is fixed for
// the lifetime of this page load, captured once into a const for clarity.
const sourcePage = document.referrer || undefined;

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  errorEl.hidden = true;
  submitBtn.disabled = true;

  // report-issue-main.js's own precedent -- form carries novalidate
  // (template), replaced by this styled error element instead of the
  // browser's native tooltip.
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
    const res = await fetch("/logbook/api/feedback", {
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
    // Turnstile tokens are single-use -- a failed submit needs a fresh
    // one for the retry.
    window.turnstile?.reset(turnstileWidgetId);
  }
});
