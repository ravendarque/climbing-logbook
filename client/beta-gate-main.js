// Composition root for beta.climbinglogbook.com's opt-in gate shell
// (#443/#548, ADR-0020) -- bundled by esbuild into public/logbook/
// beta-gate-app.js. Served by server/api/owned-routes.js's
// handleBetaGatedRoute() instead of the real page shell, only for a
// never-decided user (settings.beta_opt_in === null) -- an opted-out
// user is redirected server-side before this ever loads, and an
// opted-in user gets the real page shell directly, same as my.x.
//
// Same "no header-chrome.js, reimplement narrowly" shape as client/
// account-edit-main.js (see that file's own header comment) -- this page
// has no discipline-scoped content and no settings toggles either, just
// the shared chrome + the opt-in modal itself.
import { createStore } from "./store.js";
import { createAdminAuth } from "./admin-auth.js";
import { createDisclosure } from "./modal-utils.js";
import { createThemeToggle } from "./theme-toggle.js";
import { syncAdminBar } from "./admin-bar.js";
import { createBetaOptIn } from "./beta-opt-in.js";
import { resolveMyXUrl } from "./resolve-my-x-url.js";
import "./components/climbing-menu-bar.js";
import "./components/beta-opt-in-modal.js";

const ADMIN_SETTINGS_URL = "/logbook/api/admin/settings";

function adminFetch(url, options) {
  return fetch(url, { ...options, redirect: "manual" });
}
function isAuthRedirect(res) {
  return res.type === "opaqueredirect";
}

const store = createStore();

// Same divider rule as client/account-edit-main.js's own copy -- see that
// file's header comment for why this is reimplemented per-page rather
// than shared via header-chrome.js.
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
}

const adminAuth = createAdminAuth({
  store, adminFetch, isAuthRedirect,
  adminSettingsUrl: ADMIN_SETTINGS_URL,
  updateAdminBar,
});

createDisclosure(document.getElementById("header-menu-btn"), document.getElementById("header-menu-popover"), "#header-menu-wrap");
createThemeToggle();

// Not dismissible (#548): this shell exists *because* the server already
// decided the visitor hasn't chosen yet -- there's no real page behind
// the modal to fall back to on a Cancel/Close here, unlike the account
// settings entry point. "in" reloads in place so the server-side gate
// re-evaluates and serves the real page this time; "out" navigates to
// the my.x equivalent of whatever page was originally requested (this
// page's own location.pathname -- the server served this shell *for*
// that exact path, so it's already the right one to reuse).
const betaOptIn = createBetaOptIn({
  adminAuth,
  dismissible: false,
  onDecided(choseIn) {
    if (choseIn) {
      location.reload();
    } else {
      location.href = resolveMyXUrl(location.hostname, location.pathname);
    }
  },
});

async function boot() {
  await Promise.all([adminAuth.checkSession(), adminAuth.fetchSettings()]);
  updateAdminBar();
  betaOptIn.open();
}

boot();
