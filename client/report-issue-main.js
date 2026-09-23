// #924 -- own dedicated bundle (vite.entries.mjs), not folded into the
// shared help-main.js -- these elements only exist on this one page.
// Same Turnstile explicit-render + fetch/submit pattern as
// static/register/register.js (#311) -- this form is public and
// unauthenticated (reachable logged out, same as /help itself), just
// posting to a different, non-Better-Auth endpoint
// (/logbook/api/report-issue, server/api/report-issue.js).
//
// bundle: report-issue REPLACES help-main.js entirely (11ty's data
// cascade -- it doesn't layer on top), so the header menu popover, theme
// toggle, and mobile topic-list collapse that help-main.js wires up for
// every other /help/* page never run here unless repeated below (found
// 2026-09-23 -- the burger menu silently did nothing on this page).
// Same createDisclosure()/createThemeToggle() calls, no injected
// dependencies needed, as client/help-main.js's own identical section.
import { createDisclosure } from "./modal-utils.js";
import { createThemeToggle } from "./theme-toggle.js";

createDisclosure(document.getElementById("header-menu-btn"), document.getElementById("header-menu-popover"), "#header-menu-wrap");
createThemeToggle();

// help-main.js's own identical narrow-mode topic-list toggle (markup and
// breakpoint CSS live in views/_includes/help-layout.njk).
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

// #806's own precedent (register.js) -- errorEl carries role="alert"/
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
// test sitekey instead. #932 -- beta.climbinglogbook.com added
// alongside the bare apex: beta is meant to behave the same as
// production, and infra/turnstile.tf's own `domains` list now includes
// it too -- both sides have to agree, or the client would pick the real
// sitekey while Cloudflare's own siteverify still rejects it as an
// unrecognized domain. Duplicated (not shared) with static/register/
// register.js's own identical constants -- that file is copied as-is
// into public/ (#877), never Vite-bundled, so it can't import from
// shared/ in production the way this file can (that only appears to
// work in dev, where Vite's dev server happens to serve the raw source
// tree unbundled -- see vite.config.js's own comment on that exact
// trap).
const REAL_SITEKEY = "0x4AAAAAAEH3RghUN6KSc-uy";
const TEST_SITEKEY = "1x00000000000000000000AA";
const REAL_SITEKEY_HOSTNAMES = ["climbinglogbook.com", "beta.climbinglogbook.com"];
const sitekey = REAL_SITEKEY_HOSTNAMES.includes(window.location.hostname) ? REAL_SITEKEY : TEST_SITEKEY;

let turnstileWidgetId;
window.onTurnstileLoad = () => {
  turnstileWidgetId = window.turnstile.render("#turnstile-widget", { sitekey });
};

// document.referrer is fixed for the lifetime of this page load (set once
// at navigation, never changes) -- reading it here or at submit time is
// equivalent; captured once into a const for clarity. Empty when there's
// no referrer at all (direct navigation, a bookmark) -- undefined then,
// same "omit rather than send an empty string" convention every optional
// field on this form follows (JSON.stringify drops an undefined-valued
// key entirely, which is what makes the server's own v.optional() field
// see it as genuinely absent rather than an empty string to validate).
const sourcePage = document.referrer || undefined;

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  errorEl.hidden = true;
  submitBtn.disabled = true;

  // #930 -- form carries novalidate (template) specifically so this
  // replaces the browser's own native "fill out this field" tooltip --
  // Raven's own call, British English ("fill in," not "fill out") and
  // this form's existing styled error-message element instead of a
  // native, unstyled one. #932 -- names the field: the error banner sits
  // well below the field itself, so a bare "Please fill in this field"
  // gave no indication of which one without scrolling back up to look.
  if (!messageEl.value.trim()) {
    showError('Please fill in the "What happened?" field.');
    submitBtn.disabled = false;
    return;
  }

  // #311's own precedent -- window.turnstile is only defined once
  // Cloudflare's api.js (loaded async in this page's own <head>) has
  // actually loaded; a slow connection could reach here first. Either
  // way, no token means the server-side check (server/lib/turnstile.js's
  // verifyTurnstile) would reject this anyway -- catching it here just
  // gives a clearer message than a generic failure.
  const turnstileToken = window.turnstile?.getResponse(turnstileWidgetId);
  if (!turnstileToken) {
    showError("Please complete the verification check.");
    submitBtn.disabled = false;
    return;
  }

  try {
    const res = await fetch("/logbook/api/report-issue", {
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
    // Turnstile tokens are single-use -- a failed submit needs a fresh
    // one for the retry, or the server-side check would reject an
    // already-spent token even once the actual form error is fixed.
    window.turnstile?.reset(turnstileWidgetId);
  }
});
