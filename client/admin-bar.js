// Shared by #348's owner-only composition roots (map-main.js,
// performance-pyramid-main.js, performance-hub-main.js, log-main.js,
// account-main.js, account-edit-main.js)
// -- login-toggle-btn/menu-username/my-account-link and the tab-bar's
// show-performance attribute (the #151 rule: Grade Pyramid needs BOTH
// login AND Athlete Mode on) were hand-copied identically across the
// first three, with no comment acknowledging the duplication (found via
// code review, 2026-08-09). addBtn/offlineSync are optional -- only
// log-main.js has them (the one page that actually writes data). tabBar
// is optional too (#302) -- the account pages have no <climbing-tab-bar>
// at all (not one of its log/map/performance views), same "don't wire up
// something that isn't on this page" reasoning as the other two.
//
// Athlete Mode/Public Logbook's own toggle UI moved off the shared menu
// entirely (#445) -- climbing-menu-bar.js no longer renders athlete-mode-
// btn/public-toggle-btn on any page, so this function no longer touches
// either. adminAuth.isAthleteMode()/isLogbookPublic() (the underlying
// state, not any DOM element) still drive tabBar's show-performance
// attribute below; client/account-main.js is the one place with actual
// toggle controls, syncing its own rows separately after calling this.
export function syncAdminBar({ store, adminAuth, headerChrome, tabBar, addBtn, offlineSync }) {
  const loginToggleBtn = document.getElementById("login-toggle-btn");
  const menuUsername = document.getElementById("menu-username");
  const myAccountLink = document.getElementById("my-account-link");
  loginToggleBtn.textContent = store.isLoggedIn() ? "Log out" : "Log in";
  if (addBtn) addBtn.hidden = !store.isLoggedIn();
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
  headerChrome.updateMenuDivider();
  if (offlineSync) offlineSync.updateSyncButton();
  if (tabBar) tabBar.toggleAttribute("show-performance", store.isLoggedIn() && adminAuth.isAthleteMode());
}
