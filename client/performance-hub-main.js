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
import "./components/climbing-menu-bar.js";
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
];

function adminFetch(url, options) {
  return fetch(url, { ...options, redirect: "manual" });
}
function isAuthRedirect(res) {
  return res.type === "opaqueredirect";
}

const USERNAME = location.pathname.split("/").filter(Boolean)[0] || "";

const store = createStore();
store.subscribe(render);

const tabBar = document.querySelector("climbing-tab-bar");
tabBar.setAttribute("username", USERNAME);

const tilesEl = document.getElementById("insight-tiles");

function renderTiles() {
  tilesEl.innerHTML = INSIGHTS.map(insight => rowCardHtml({
    id: insight.id,
    title: insight.title,
    description: insight.description,
    controlHtml: `<a class="admin-btn shrink-0" href="/${encodeURIComponent(USERNAME)}/performance/${insight.route}">View</a>`,
  })).join("");
}

function render() {
  headerChrome.updateDisciplinePicker();
  updateAdminBar();
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

  if (!adminAuth.isAthleteMode()) {
    location.href = `/${encodeURIComponent(USERNAME)}/log`;
    return;
  }

  renderTiles();
  render();
}

boot();
