import { isDemoUsername } from "./demo-mode.js";
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
  headerChrome.updateMenuDivider();
  if (offlineSync) offlineSync.updateSyncButton();
  // Called on every render; the tab bar ignores all but the first.
  if (tabBar) {
    tabBar.toggleAttribute("show-performance", isDemo || (store.isLoggedIn() && adminAuth.isAthleteMode()));
    tabBar.markReady();
  }
}
