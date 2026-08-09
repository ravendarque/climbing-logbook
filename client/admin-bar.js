// Shared by #348's three owner-only composition roots (map-main.js,
// performance-main.js, log-main.js) -- login-toggle-btn/athlete-mode-btn/
// the tab-bar's show-performance attribute (the #151 rule: Grade Pyramid
// needs BOTH login AND Athlete Mode on) were hand-copied identically
// across all three, with no comment acknowledging the duplication (found
// via code review, 2026-08-09). addBtn/offlineSync are optional -- only
// log-main.js has them (the one page that actually writes data).
//
// Not used by client/main.js (/logbook's own, still-untouched composition
// root, which keeps its own equivalent logic inline) -- #344's parallel-
// migration decision holds /logbook stable throughout this epic; that
// policy isn't this PR's call to unilaterally revisit.
export function syncAdminBar({ store, adminAuth, headerChrome, tabBar, addBtn, offlineSync }) {
  const loginToggleBtn = document.getElementById("login-toggle-btn");
  const athleteModeBtn = document.getElementById("athlete-mode-btn");
  loginToggleBtn.textContent = store.isLoggedIn() ? "Log out" : "Log in";
  if (addBtn) addBtn.hidden = !store.isLoggedIn();
  athleteModeBtn.hidden = !store.isLoggedIn();
  athleteModeBtn.setAttribute("aria-checked", String(adminAuth.isAthleteMode()));
  headerChrome.updateMenuDivider();
  if (offlineSync) offlineSync.updateSyncButton();
  tabBar.toggleAttribute("show-performance", store.isLoggedIn() && adminAuth.isAthleteMode());
}
