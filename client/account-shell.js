import { createStore } from "./store.js";
import { createAdminAuth } from "./admin-auth.js";
import { createDisclosure } from "./modal-utils.js";
import { createThemeToggle } from "./theme-toggle.js";
import { syncAdminBar } from "./admin-bar.js";
import { apiFetch } from "./api-fetch.js";

const SETTINGS_URL = "/-/api/settings";

// Account pages have no discipline picker, which app-shell.js's header needs.
export function createAccountShell({ onAdminBarUpdate = () => {} } = {}) {
  const username = location.pathname.split("/").filter(Boolean)[0] || "";
  const store = createStore();

  const menuUsername = document.getElementById("menu-username");
  const headerMenuBottomRow = document.getElementById("header-menu-bottom-row");
  function updateMenuDivider() {
    const hasTopContent = !menuUsername.hidden;
    headerMenuBottomRow.classList.toggle("border-t", hasTopContent);
    headerMenuBottomRow.classList.toggle("pt-2", hasTopContent);
    headerMenuBottomRow.classList.toggle("mt-1", hasTopContent);
  }

  function updateAdminBar() {
    syncAdminBar({ store, adminAuth, headerChrome: { updateMenuDivider } });
    onAdminBarUpdate();
  }

  const adminAuth = createAdminAuth({ store, apiFetch, settingsUrl: SETTINGS_URL, updateAdminBar });

  createDisclosure(
    document.getElementById("header-menu-btn"),
    document.getElementById("header-menu-popover"),
    "#header-menu-wrap",
  );
  createThemeToggle();

  return { username, store, adminAuth, updateAdminBar };
}
