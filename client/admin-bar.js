import { isDemoUsername } from "./demo-mode.js";
import { resolveMyXUrl } from "./resolve-cross-hostname-url.js";
import { tourStartUrl } from "./tour/tour-url.js";
// A demo visitor has no session, so is treated as logged in here for every page.
function isDemoVisitor() {
  return isDemoUsername(location.pathname.split("/").filter(Boolean)[0] || "");
}

export function syncAdminBar({ store, adminAuth, headerChrome, tabBar, addBtn, offlineSync }) {
  const loginToggleBtn = document.getElementById("login-toggle-btn");
  const menuUsername = document.getElementById("menu-username");
  const myAccountLink = document.getElementById("my-account-link");
  const isDemo = isDemoVisitor();
  loginToggleBtn.textContent = store.isLoggedIn() ? "Log out" : "Log in";
  if (addBtn) addBtn.hidden = !isDemo && !store.isLoggedIn();
  // Hidden until the username is known: an offline login hint has no username to link with.
  const username = adminAuth.getUsername();
  menuUsername.hidden = !username;
  menuUsername.textContent = username ?? "";
  myAccountLink.hidden = !username;
  if (username) myAccountLink.href = `/${encodeURIComponent(username)}/account`;
  const demoTourLink = document.getElementById("demo-tour-link");
  if (demoTourLink) {
    demoTourLink.hidden = !isDemo;
    if (isDemo) demoTourLink.href = tourStartUrl(location.pathname, location.pathname.split("/")[1]);
  }
  const publicLogbookLink = document.getElementById("public-logbook-link");
  if (publicLogbookLink) {
    publicLogbookLink.hidden = !username || !adminAuth.isLogbookPublic();
    if (username) publicLogbookLink.href = resolveMyXUrl(location.hostname, `/${encodeURIComponent(username)}`);
  }
  headerChrome.updateMenuDivider();
  if (offlineSync) offlineSync.updateSyncLine();
  const performanceTab = document.getElementById("performance-tab");
  if (performanceTab) performanceTab.hidden = !(isDemo || (store.isLoggedIn() && adminAuth.isAthleteMode()));
  if (tabBar) tabBar.markReady();
}
