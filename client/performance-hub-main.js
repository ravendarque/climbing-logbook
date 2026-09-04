// Composition root for /:username/performance (#575, epic #5 Phase 2) --
// the hub page listing every Performance Insight as a tile. Bundled by
// esbuild into public/logbook/performance-hub-app.js, same pattern as
// every other owned page's composition root. Reuses store.js/admin-
// auth.js/header-chrome.js unchanged, same as client/performance-
// pyramid-main.js.
//
// Same Athlete-Mode-off redirect rule as the pyramid page it replaced at
// this bare path (#151) -- a visitor with Athlete Mode off has nowhere
// real to land here, same fallback every owned page with a hide-if-off
// tab applies.
import { createStore } from "./store.js";
import { createAdminAuth } from "./admin-auth.js";
import { createHeaderChrome } from "./header-chrome.js";
import { syncAdminBar } from "./admin-bar.js";
import { rowCardHtml } from "./row-card.js";
import { flashLabel, sendLabel } from "./status.js";
import { isDemoUsername } from "./demo-mode.js";
import "./components/climbing-tab-bar.js";

const ADMIN_SETTINGS_URL = "/logbook/api/admin/settings";

// Each entry becomes one tile. Only #12 (grade pyramid) exists today --
// #15/#13/#14/#38/#39 each add their own entry here when they land, per
// epic #5's own Phase 2 delivery sequence.
const INSIGHTS = [
  {
    id: "insight-pyramid",
    title: "Grade Pyramid",
    description: "See your sends broken down by grade, and how your pyramid's shape has changed over time.",
    route: "pyramid",
  },
  {
    id: "insight-injury",
    title: "Injury / Pain Log",
    description: "Browse every climb where something hurt, and see which moves your pain flags cluster around.",
    route: "injury",
  },
  {
    id: "insight-strengths",
    title: "Strengths / Weaknesses",
    description: "See which hold types, wall angles, and movements are your weakest combination, and drill into any one of them.",
    route: "strengths",
  },
  {
    id: "insight-trends",
    title: "Volume / Intensity",
    description: "See how many climbs you're sending over time, and how your max grade is trending alongside it.",
    route: "trends",
  },
  {
    id: "insight-gap",
    // #599 -- discipline-aware: this view's own content already switches
    // between Flash/Send (boulder) and Onsight/Redpoint (lead)
    // terminology (client/status.js, established in #14), but the hub
    // tile linking to it had a fixed literal title that never matched
    // Boulder. Function instead of a plain string -- the only entry
    // here that needs this, so renderTiles() calls it if present rather
    // than making every entry support a title function for one case.
    title: type => `${sendLabel(type)} / ${flashLabel(type)} Gap`,
    description: "Compare your first-try sends against what you eventually send once you've worked a climb, and see how many attempts it typically takes.",
    route: "gap",
  },
  {
    id: "insight-rpe",
    title: "Effort / RPE Trend",
    description: "See how hard you're pushing relative to your grade progress, and whether there's room to try harder.",
    route: "rpe",
  },
];

function adminFetch(url, options) {
  return fetch(url, { ...options, redirect: "manual" });
}
function isAuthRedirect(res) {
  return res.type === "opaqueredirect";
}

const USERNAME = location.pathname.split("/").filter(Boolean)[0] || "";
// #251 -- one of the three seeded, publicly-viewable demo accounts.
const IS_DEMO = isDemoUsername(USERNAME);

const store = createStore();
store.subscribe(render);

const tabBar = document.querySelector("climbing-tab-bar");
tabBar.setAttribute("username", USERNAME);

const tilesEl = document.getElementById("insight-tiles");

function renderTiles() {
  const type = store.getActiveType();
  tilesEl.innerHTML = INSIGHTS.map(insight => rowCardHtml({
    id: insight.id,
    title: typeof insight.title === "function" ? insight.title(type) : insight.title,
    description: insight.description,
    controlHtml: `<a class="admin-btn shrink-0" href="/${encodeURIComponent(USERNAME)}/performance/${insight.route}">View</a>`,
  })).join("");
}

function render() {
  headerChrome.updateDisciplinePicker();
  updateAdminBar();
  // #599 -- the gap tile's title depends on the active discipline, so
  // this needs to re-run on every store notification (discipline
  // switches included), not just once from boot().
  renderTiles();
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
  // client/header-chrome.js:68 calls resetPyramidExpansion()
  // unconditionally from the discipline-picker's option-click handler --
  // no guard, no optional chaining. The hub page renders no pyramid, but
  // omitting this callback entirely would throw the moment a visitor
  // used the discipline picker here, so it's a real no-op, not left out.
  resetPyramidExpansion: () => {},
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/logbook/sw.js").catch(() => {});
}

async function boot() {
  store.setActiveView("performance-hub");

  const sessionPromise = adminAuth.checkSession();
  const settingsPromise = adminAuth.fetchSettings();

  await adminAuth.resolveActiveType(sessionPromise, settingsPromise);

  // #251 -- skipped entirely for the three reserved demo usernames, same
  // "not auth-gated" treatment owned-routes.js's isDemoPerformancePage
  // already gives the page itself.
  if (!IS_DEMO && !adminAuth.isAthleteMode()) {
    location.href = `/${encodeURIComponent(USERNAME)}/log`;
    return;
  }

  render();
  tabBar.markReady(); // #605
}

boot();
