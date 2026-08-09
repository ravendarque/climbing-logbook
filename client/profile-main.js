// Composition root for the public, read-only /:username page (#351) --
// bundled by esbuild into public/logbook/profile-app.js. The smallest of
// the four composition roots by design: no client/store.js (this page has
// no admin/auth/discipline-persistence state to own -- it's a single,
// anonymous, read-only render of one target user's data), no adminFetch/
// isAuthRedirect, no entry-form.js/place-picker.js/offline-sync.js/
// content-overlays.js/modal-utils.js at all. "Security by absence" per
// #344's decision: this bundle genuinely cannot write anything, not just
// UI-hidden from doing so.
//
// <climbing-entries-table> (#350) is used exactly as client/log-main.js
// uses it, just fed from the new public data endpoints (src/api/
// public-data.js) instead of the session-scoped /logbook/api/* ones, and
// never given the `editable` attribute.
import { createDisclosure } from "./modal-utils.js";
import "./components/climbing-menu-bar.js";
import "./components/climbing-entries-table.js";

// /:username -- same single-segment extraction as every other
// composition root's USERNAME constant, but this one's also the actual
// data-fetch target (the other three pages' USERNAME is only ever used
// for building links/page identity; this page's *entire* data source is
// scoped by it).
const USERNAME = location.pathname.split("/").filter(Boolean)[0] || "";
document.title = `${USERNAME} – Climbing Logbook`;

const entriesTable = document.querySelector("climbing-entries-table");

// Local, single-purpose state -- no client/store.js here at all (see this
// file's own header comment). activeDiscipline is genuinely just UI
// state for this one render, not anything persisted anywhere (there's no
// session to persist it to, and no reason a public visitor's discipline
// choice should survive a reload the way the owner's own does).
let activeDiscipline = "boulder";

// Same discipline-picker wiring client/header-chrome.js owns for every
// other page, trimmed to what this page actually has: no Athlete Mode, no
// adminFetch persistence call, no resetPyramidExpansion (no pyramid here
// at all). Reimplemented directly rather than injected from
// header-chrome.js -- that module's whole contract (adminSettingsUrl,
// resetPyramidExpansion) assumes a session/pyramid this page will never
// have; trying to reuse it here would mean threading no-ops through
// parameters that exist for other pages' real needs, not genuinely
// sharing behavior.
function updateDisciplinePicker() {
  const label = activeDiscipline === "boulder" ? "Boulder" : "Lead";
  document.getElementById("discipline-btn-label").textContent = label;
  document.getElementById("discipline-btn").setAttribute("aria-label", `Discipline: ${label}`);
  document.querySelectorAll(".discipline-option").forEach(opt => {
    opt.setAttribute("aria-selected", String(opt.dataset.discipline === activeDiscipline));
  });
}

function render() {
  updateDisciplinePicker();
  entriesTable.activeDiscipline = activeDiscipline;
}

// Same open/close/outside-click/Escape mechanics as
// client/header-chrome.js's own discipline picker, via the same shared
// createDisclosure() (#171) -- only the click-to-switch handler itself is
// reimplemented (not injected from header-chrome.js), since that
// module's contract assumes a store.js/resetPyramidExpansion/
// adminSettingsUrl this page will never have -- see this file's own
// header comment on why.
const disciplineBtn = document.getElementById("discipline-btn");
const disciplinePopover = document.getElementById("discipline-popover");
const { close: closeDisciplinePopover } = createDisclosure(disciplineBtn, disciplinePopover, "#discipline-wrap");

disciplinePopover.addEventListener("click", e => {
  const opt = e.target.closest(".discipline-option");
  if (!opt) return;
  activeDiscipline = opt.dataset.discipline;
  closeDisciplinePopover();
  disciplineBtn.focus();
  render();
});

// Header menu popover (theme toggle only, with admin-hidden -- see
// public/profile/index.html's own comment) -- same createDisclosure()
// call client/header-chrome.js's own header-menu-btn/-popover wiring
// makes, no injected dependencies needed for this half of it either.
createDisclosure(document.getElementById("header-menu-btn"), document.getElementById("header-menu-popover"), "#header-menu-wrap");

// Theme toggle -- same self-contained logic as client/header-chrome.js's
// own copy (see that file's own comment on the deferred-update/detached-
// node subtlety this mirrors), duplicated directly rather than shared:
// header-chrome.js's factory bundles this together with the discipline
// picker/Athlete Mode/admin-bar behavior this page doesn't have, so
// reusing it would mean threading no-op stand-ins through parameters
// that exist for other pages' real needs.
const SUN_ICON = `<svg viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2"></path><path d="M12 20v2"></path><path d="m4.93 4.93 1.41 1.41"></path><path d="m17.66 17.66 1.41 1.41"></path><path d="M2 12h2"></path><path d="M20 12h2"></path><path d="m6.34 17.66-1.41 1.41"></path><path d="m19.07 4.93-1.41 1.41"></path></svg>`;
const MOON_ICON = `<svg viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"></path></svg>`;
const themeToggleBtn = document.getElementById("theme-toggle-btn");
function updateThemeToggleButton() {
  const theme = document.documentElement.dataset.theme;
  themeToggleBtn.innerHTML = theme === "light" ? MOON_ICON : SUN_ICON;
  themeToggleBtn.setAttribute("aria-label", theme === "light" ? "Switch to dark theme" : "Switch to light theme");
}
updateThemeToggleButton();
themeToggleBtn.addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
  document.documentElement.dataset.theme = next;
  localStorage.setItem("logbook_theme", next);
  // Deferred via setTimeout, not called inline -- same detached-click-
  // target-confuses-the-outside-click-listener hazard client/
  // header-chrome.js's own identical copy documents (this page wires the
  // same createDisclosure()-based outside-click behavior on
  // #header-menu-wrap above), and the same reason a queueMicrotask isn't
  // enough -- see that file's own comment for the full empirical detail.
  setTimeout(updateThemeToggleButton, 0);
});

// Same fetch+parse+ok-check ceremony as every other composition root's
// loadResource() -- unchanged copy, not worth sharing for four call sites
// each. A failed/404 fetch here (private or nonexistent user) can't
// actually happen in practice -- src/api/public-profile.js's own gate
// already 404s before this shell is ever served -- but the empty-array
// fallback keeps this page inert rather than throwing if that assumption
// is ever wrong.
async function loadResource(url, key) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data[key] ?? [];
}

async function boot() {
  const base = `/logbook/api/public/${encodeURIComponent(USERNAME)}`;
  const [entries, places, locations] = await Promise.all([
    loadResource(`${base}/logbook`, "entries").catch(() => []),
    loadResource(`${base}/places`, "places").catch(() => []),
    loadResource(`${base}/locations`, "locations").catch(() => []),
  ]);

  const hasBoulder = entries.some(e => e.type === "boulder");
  const hasLead = entries.some(e => e.type === "lead");
  activeDiscipline = hasBoulder || !hasLead ? "boulder" : "lead";

  entriesTable.entries = entries;
  entriesTable.places = places;
  entriesTable.locations = locations;
  render();
}

boot();
