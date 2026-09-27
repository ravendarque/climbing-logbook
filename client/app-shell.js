import { createStore } from "./store.js";
import { createAdminAuth } from "./admin-auth.js";
import { createHeaderChrome } from "./header-chrome.js";
import { syncAdminBar } from "./admin-bar.js";
import { createSyncStatusIcon } from "./sync-status-icon.js";
import { isDemoUsername } from "./demo-mode.js";
import { apiFetch } from "./api-fetch.js";
import "./components/climbing-tab-bar.js";

const SETTINGS_URL = "/-/api/settings";

// Everything a page with the tab bar and discipline picker sets up the same way.
export function createAppShell({ render, noCacheForDemo = false, adminBarExtras = () => ({}) }) {
  const username = location.pathname.split("/").filter(Boolean)[0] || "";
  const isDemo = isDemoUsername(username);

  // A demo never caches: anyone can open it, including an owner signed in on this browser.
  const store = createStore(
    noCacheForDemo && isDemo ? { storage: { getItem: () => null, setItem: () => {} } } : undefined,
  );
  const syncStatusIcon = createSyncStatusIcon();
  store.subscribe(render);

  const tabBar = document.querySelector("climbing-tab-bar");
  tabBar.setAttribute("username", username);

  function updateAdminBar() {
    syncAdminBar({ store, adminAuth, headerChrome, tabBar, ...adminBarExtras() });
  }

  const adminAuth = createAdminAuth({
    store,
    apiFetch,
    settingsUrl: SETTINGS_URL,
    updateAdminBar,
    onFetchTimeout: syncStatusIcon.reportTimeout,
  });
  const headerChrome = createHeaderChrome({ store, apiFetch, settingsUrl: SETTINGS_URL });

  // Waits for real settings before the Athlete Mode redirect: a cached "on" may be stale.
  async function authenticateAthlete(view) {
    store.setActiveView(view);
    adminAuth.setInitialActiveType();
    const sessionPromise = syncStatusIcon.track(adminAuth.checkSession());
    const settingsPromise = syncStatusIcon.track(adminAuth.fetchSettings());
    await adminAuth.reconcileActiveType(sessionPromise, settingsPromise);
    if (!isDemo && !adminAuth.isAthleteMode()) {
      location.href = `/${encodeURIComponent(username)}/log`;
      return false;
    }
    return true;
  }

  return {
    username,
    isDemo,
    store,
    syncStatusIcon,
    tabBar,
    adminAuth,
    headerChrome,
    updateAdminBar,
    authenticateAthlete,
  };
}
