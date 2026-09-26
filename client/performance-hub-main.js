import { createStore } from "./store.js";
import { createAdminAuth } from "./admin-auth.js";
import { createHeaderChrome } from "./header-chrome.js";
import { syncAdminBar } from "./admin-bar.js";
import { createSyncStatusIcon } from "./sync-status-icon.js";
import { rowCardHtml } from "./row-card.js";
import { flashLabel, sendLabel } from "./status.js";
import { isDemoUsername } from "./demo-mode.js";
import "./components/climbing-tab-bar.js";
import { pageAllowsBoot } from "./boot-gate.js";
import { registerServiceWorker } from "./register-sw.js";

const SETTINGS_URL = "/-/api/settings";

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
const IS_DEMO = isDemoUsername(USERNAME);

const store = createStore();
const syncStatusIcon = createSyncStatusIcon();
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
    controlHtml: `<a class="btn shrink-0" href="/${encodeURIComponent(USERNAME)}/performance/${insight.route}">View</a>`,
  })).join("");
}

function render() {
  headerChrome.updateDisciplinePicker();
  updateAdminBar();
  renderTiles();
}

function updateAdminBar() {
  syncAdminBar({ store, adminAuth, headerChrome, tabBar });
}

const adminAuth = createAdminAuth({
  store, adminFetch, isAuthRedirect,
  settingsUrl: SETTINGS_URL,
  updateAdminBar,
  onFetchTimeout: syncStatusIcon.reportTimeout,
});

const headerChrome = createHeaderChrome({
  store, adminFetch, isAuthRedirect,
  settingsUrl: SETTINGS_URL,
});

async function boot() {
  store.setActiveView("performance-hub");

  // The Athlete Mode redirect waits for real settings: a cached "on" may be stale.
  adminAuth.setInitialActiveType();

  const sessionPromise = syncStatusIcon.track(adminAuth.checkSession());
  const settingsPromise = syncStatusIcon.track(adminAuth.fetchSettings());

  await adminAuth.reconcileActiveType(sessionPromise, settingsPromise);

  if (!IS_DEMO && !adminAuth.isAthleteMode()) {
    location.href = `/${encodeURIComponent(USERNAME)}/log`;
    return;
  }

  render();
}

pageAllowsBoot().then(allowed => {
  if (!allowed) return;
  registerServiceWorker({ after: boot() });
});
