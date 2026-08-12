// Shared by #348's three owner-only composition roots (map-main.js,
// performance-main.js, log-main.js) -- login-toggle-btn/athlete-mode-btn/
// the tab-bar's show-performance attribute (the #151 rule: Grade Pyramid
// needs BOTH login AND Athlete Mode on) were hand-copied identically
// across all three, with no comment acknowledging the duplication (found
// via code review, 2026-08-09). addBtn/offlineSync are optional -- only
// log-main.js has them (the one page that actually writes data). tabBar
// is optional too (#302) -- the account pages have no <climbing-tab-bar>
// at all (not one of its log/map/performance views), same "don't wire up
// something that isn't on this page" reasoning as the other two.
//
// Not used by client/main.js (/logbook's own, still-untouched composition
// root, which keeps its own equivalent logic inline) -- #344's parallel-
// migration decision holds /logbook stable throughout this epic; that
// policy isn't this PR's call to unilaterally revisit.
export function syncAdminBar({ store, adminAuth, headerChrome, tabBar, addBtn, offlineSync }) {
  const loginToggleBtn = document.getElementById("login-toggle-btn");
  const athleteModeBtn = document.getElementById("athlete-mode-btn");
  const publicToggleBtn = document.getElementById("public-toggle-btn");
  const menuUsername = document.getElementById("menu-username");
  const myAccountLink = document.getElementById("my-account-link");
  loginToggleBtn.textContent = store.isLoggedIn() ? "Log out" : "Log in";
  if (addBtn) addBtn.hidden = !store.isLoggedIn();
  athleteModeBtn.hidden = !store.isLoggedIn();
  athleteModeBtn.setAttribute("aria-checked", String(adminAuth.isAthleteMode()));
  // #302 -- hidden whenever the username isn't known yet, not just when
  // logged out: checkSession()'s offline fallback branch can leave
  // store.isLoggedIn() true from a stale hint with no real username to
  // build /:username/account from, and a broken href is worse than a
  // briefly-missing link.
  const username = adminAuth.getUsername();
  menuUsername.hidden = !username;
  menuUsername.textContent = username ?? "";
  myAccountLink.hidden = !username;
  if (username) myAccountLink.href = `/${encodeURIComponent(username)}/account`;
  // #301 -- same visibility rule as athleteModeBtn above (both share the
  // same "logged-in admin only" row); unguarded, unlike admin-auth.js's
  // own null-checked wiring, since this function itself is never called
  // by /logbook (see this file's own header comment) -- the element is
  // guaranteed to exist on every page that does call it.
  publicToggleBtn.hidden = !store.isLoggedIn();
  publicToggleBtn.setAttribute("aria-checked", String(adminAuth.isLogbookPublic()));
  headerChrome.updateMenuDivider();
  if (offlineSync) offlineSync.updateSyncButton();
  if (tabBar) tabBar.toggleAttribute("show-performance", store.isLoggedIn() && adminAuth.isAthleteMode());
}
