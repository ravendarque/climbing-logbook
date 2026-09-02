// Composition root for /:username/performance/strengths (#13) -- bundled by
// esbuild into public/logbook/performance-strengths-app.js, same pattern as
// client/map-main.js (see that file's own comment for the general "trimmed
// from client/main.js" reasoning). Reuses store.js/admin-auth.js/
// header-chrome.js unchanged.
//
// #111 -- this page no longer fetches raw entries or computes anything
// itself. STRENGTHS_URL returns the already-computed strengths/weaknesses
// data (server/api/performance.js running shared/strengths-stats.js in the
// Worker against the full D1 result set) -- store.js's entries/cache
// machinery isn't used on this page at all any more, and there's
// deliberately no offline fallback: performance insights are online-only
// (Raven's own call, see the #performance-offline message in
// public/performance/strengths/index.html for the reasoning).
//
// No modal-utils.js/content-overlays.js here either, same reasoning as
// map-main.js -- this page has no notes/footnote overlay of its own; the
// strengths/weaknesses view's row cards are plain text, not sourced claims
// needing a citations/evidence-tier overlay the way the pyramid page's own
// component does.
import { createStore } from "./store.js";
import { createAdminAuth } from "./admin-auth.js";
import { createHeaderChrome } from "./header-chrome.js";
import { syncAdminBar } from "./admin-bar.js";
import { escapeHtml } from "./escape-html.js";
import { humanize } from "../shared/tag-stats-helpers.js";
import "./components/climbing-menu-bar.js";
import "./components/climbing-tab-bar.js";

const STRENGTHS_URL = "/logbook/api/performance/strengths";
const ADMIN_SETTINGS_URL = "/logbook/api/admin/settings";

// Same opaqueredirect-detection reasoning as client/main.js's own
// adminFetch/isAuthRedirect -- unchanged copy, not worth sharing a
// two-line pair across a module boundary (same call map-main.js made).
function adminFetch(url, options) {
  return fetch(url, { ...options, redirect: "manual" });
}
function isAuthRedirect(res) {
  return res.type === "opaqueredirect";
}

// /:username/performance/strengths -- same single-segment extraction as map-main.js.
const USERNAME = location.pathname.split("/").filter(Boolean)[0] || "";

const store = createStore();
store.subscribe(render);
// Deliberately NOT store.setActiveView(...) here -- same temporal-dead-zone
// hazard map-main.js's own comment documents (a real crash caught during
// #348's manual verification of that page). Set inside boot() instead.

const tabBar = document.querySelector("climbing-tab-bar");
tabBar.setAttribute("username", USERNAME);

const strengthsRootEl = document.getElementById("strengths-root");
const offlineEl = document.getElementById("performance-offline");

function render() {
  headerChrome.updateDisciplinePicker();
  updateAdminBar();
}

// #111 -- a plain fetch, not fetch-json.js's loadResource(): that helper
// assumes a single `{ [key]: array }` shape (defaulting to `[]` on a
// missing key), but this endpoint returns different top-level shapes
// depending on the query params (see handleGetStrengthsWeaknesses in
// server/api/performance.js), not a single list.
async function fetchStrengths() {
  const res = await fetch(STRENGTHS_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function updateAdminBar() {
  syncAdminBar({ store, adminAuth, headerChrome, tabBar });
}

const adminAuth = createAdminAuth({
  store, adminFetch, isAuthRedirect,
  adminSettingsUrl: ADMIN_SETTINGS_URL,
  updateAdminBar,
});

const headerChrome = createHeaderChrome({
  store, adminFetch, isAuthRedirect,
  adminSettingsUrl: ADMIN_SETTINGS_URL,
  resetPyramidExpansion: () => {},
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/logbook/sw.js").catch(() => {});
}

// #614 -- same shared humanize()-based convention as shared/
// strengths-stats.js's own limbSideLabel()/availableAnchors(), not an
// independent local capitalize() -- this used to render "Toe-hook"
// (hyphen intact) where the anchor picker right above it on this same
// page rendered a differently-cased label for the identical value.
function cellRowHtml(cell) {
  const pct = Math.round(cell.score * 100);
  const label = `${humanize(`${cell.side}-${cell.limb}`)} · ${humanize(cell.holdType)} · ${humanize(cell.movementStyle)} · ${humanize(cell.wallAngle)}`;
  return `<div class="row-card">
    <span class="row-card-title">${escapeHtml(label)}</span>
    <p class="text-[.82rem] text-muted mt-1">${pct}% hardest (${cell.hardestCount}/${cell.total})</p>
  </div>`;
}

async function fetchRankedForAnchor(dimension, value) {
  const res = await fetch(`${STRENGTHS_URL}?dimension=${encodeURIComponent(dimension)}&value=${encodeURIComponent(value)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

let latestAnchorRequestId = 0;

// A rapid re-selection (reachable via keyboard arrow-key navigation through
// the native <select>, which fires `change` per option in Chrome/Firefox)
// can let an earlier, now-stale fetch resolve after a later one -- this
// request-token guard makes sure only the response matching the
// currently-selected value ever reaches the DOM.
async function onAnchorChange(select) {
  const rankedListEl = document.getElementById("strengths-ranked-list");
  const [dimension, value] = select.value.split(":");
  const requestId = ++latestAnchorRequestId;
  if (!dimension) {
    rankedListEl.innerHTML = "";
    return;
  }
  try {
    const { ranked } = await fetchRankedForAnchor(dimension, value);
    if (requestId !== latestAnchorRequestId) return; // a newer selection has already superseded this response
    rankedListEl.innerHTML = ranked.length
      ? ranked.map(cellRowHtml).join("")
      : `<p class="text-[.85rem] text-muted">No combinations for this anchor clear the confidence gate yet.</p>`;
  } catch {
    if (requestId !== latestAnchorRequestId) return;
    rankedListEl.innerHTML = `<p class="text-[.85rem] text-muted">Couldn't load this drill-down -- try again.</p>`;
  }
}

function anchorOptionsHtml(anchors) {
  const groups = {
    limbSide: { label: "Limb", options: [] },
    holdType: { label: "Hold type", options: [] },
    movementStyle: { label: "Movement", options: [] },
    wallAngle: { label: "Wall angle", options: [] },
  };
  for (const anchor of anchors) {
    if (!groups[anchor.dimension]) continue;
    groups[anchor.dimension].options.push(anchor);
  }
  return Object.values(groups)
    .filter(g => g.options.length)
    .map(g => `<optgroup label="${escapeHtml(g.label)}">${g.options.map(a => `<option value="${escapeHtml(a.dimension)}:${escapeHtml(a.value)}">${escapeHtml(a.label)}</option>`).join("")}</optgroup>`)
    .join("");
}

function renderStrengths({ headline, anchors }) {
  const headlineHtml = headline
    ? `<p class="text-[.95rem] font-semibold text-foreground mb-4" id="strengths-headline">${escapeHtml(headline.text)}</p>`
    : `<p class="text-[.85rem] text-muted mb-4" id="strengths-headline">Not enough data yet to spot a pattern -- keep tagging moves as you climb.</p>`;

  // #604 -- gated on `headline`, not `anchors.length`: showing the
  // drill-down picker only when there's a real, confidence-gate-clearing
  // headline result keeps the picker consistent with what the headline
  // text itself claims. `anchors.length > 0` alone just means the user
  // has tagged *some* moves, which can be true even when no single
  // combination has cleared MIN_TAG_COUNT yet -- offering a drill-down
  // right next to a "not enough data yet" message read as contradictory.
  const pickerHtml = headline
    ? `<div class="mb-4">
        <label class="text-[.72rem] font-semibold uppercase tracking-[.07em] text-muted mb-2 block" for="strengths-anchor-select">Drill into</label>
        <select class="w-full bg-surface border border-border rounded-app px-2 py-2 text-[.9rem]" id="strengths-anchor-select">
          <option value="">Choose one…</option>
          ${anchorOptionsHtml(anchors)}
        </select>
      </div>
      <div id="strengths-ranked-list"></div>`
    : "";

  strengthsRootEl.innerHTML = headlineHtml + pickerHtml;

  const select = document.getElementById("strengths-anchor-select");
  if (select) select.addEventListener("change", () => onAnchorChange(select));
}

async function boot() {
  store.setActiveView("performance-strengths");

  const sessionPromise = adminAuth.checkSession();
  const settingsPromise = adminAuth.fetchSettings();

  await adminAuth.resolveActiveType(sessionPromise, settingsPromise);

  // Performance Insights require BOTH being logged in AND Athlete Mode on
  // (#151, carried forward from /logbook's own updateAdminBar() rule, and
  // already encoded in <climbing-tab-bar>'s show-performance attribute --
  // see that component's TABS comment). owned-routes.js already guarantees
  // "logged in as this page's own owner" before this bundle ever loads, so
  // the only remaining case to handle here is the owner visiting their own
  // /performance directly with Athlete Mode off -- same fallback
  // client/main.js's updateAdminBar() applies when the tab disappears out
  // from under an active performance-strengths view (setActiveView("logbook")),
  // redirect to this page's own equivalent "somewhere with real content" --
  // /log.
  if (!adminAuth.isAthleteMode()) {
    location.href = `/${encodeURIComponent(USERNAME)}/log`;
    return;
  }

  render();

  // #111 -- online-only, deliberately no offline fallback (see this
  // file's own header comment). A failed fetch (offline, or any other
  // network/server error) shows the "needs a connection" message instead
  // of attempting to render anything -- never a locally-computed or
  // stale-cached number.
  try {
    const data = await fetchStrengths();
    offlineEl.hidden = true;
    strengthsRootEl.hidden = false;
    renderStrengths(data);
  } catch {
    offlineEl.hidden = false;
    strengthsRootEl.hidden = true;
  }
}

boot();
