// Composition root for /:username/account/beta (#953, ADR-0029 decision
// 5) -- bundled into public/-/account-beta-app.js. Joining and
// leaving the beta: a short explanation of what changes, then one button
// that writes the setting and takes you to the right app. Replaced the
// <beta-opt-in-modal> the account hub used to open.
//
// Same "no header-chrome.js, reimplement narrowly" reasoning as
// client/account-main.js (see that file's own header comment).
import { createStore } from "./store.js";
import { createAdminAuth } from "./admin-auth.js";
import { createDisclosure } from "./modal-utils.js";
import { createThemeToggle } from "./theme-toggle.js";
import { syncAdminBar } from "./admin-bar.js";
import { resolveApexUrl, resolveBetaXUrl, resolveMyXUrl } from "./resolve-cross-hostname-url.js";
import { userKey } from "./user-storage.js";
import { pageAllowsBoot } from "./boot-gate.js";
import { registerServiceWorker } from "./register-sw.js";

const SETTINGS_URL = "/-/api/settings";
// This origin's offline queue (client/log-main.js's QUEUE_KEY).
const QUEUE_KEY = userKey("logbook_pending_queue");

function adminFetch(url, options) {
  return fetch(url, { ...options, redirect: "manual" });
}
function isAuthRedirect(res) {
  return res.type === "opaqueredirect";
}

const USERNAME = location.pathname.split("/").filter(Boolean)[0] || "";
const LOG_PATH = `/${encodeURIComponent(USERNAME)}/log`;

const store = createStore();

document.getElementById("back-to-account-link").href = `/${encodeURIComponent(USERNAME)}/account`;
// Help is an apex page; app hosts serve only the app.
document.getElementById("beta-help-link").href = resolveApexUrl(location.hostname, "/help/beta-channel/");

const menuUsername = document.getElementById("menu-username");
const headerMenuBottomRow = document.getElementById("header-menu-bottom-row");
function updateMenuDivider() {
  const hasTopContent = !menuUsername.hidden;
  headerMenuBottomRow.classList.toggle("border-t", hasTopContent);
  headerMenuBottomRow.classList.toggle("pt-2", hasTopContent);
  headerMenuBottomRow.classList.toggle("mt-1", hasTopContent);
}

const statusEl = document.getElementById("beta-status");
const joinEl = document.getElementById("beta-join");
const leaveEl = document.getElementById("beta-leave");
const queueWarningEl = document.getElementById("beta-queue-warning");
const queueCountEl = document.getElementById("beta-queue-count");
const actionsEl = document.getElementById("beta-actions");
const confirmBtn = document.getElementById("beta-confirm-btn");
const offlineNoteEl = document.getElementById("beta-offline-note");
const errorEl = document.getElementById("beta-error");

let saving = false;

// Changes waiting to sync from this device, on this address.
function pendingChangeCount(storage = localStorage) {
  try {
    const queue = JSON.parse(storage.getItem(QUEUE_KEY));
    return Array.isArray(queue) ? queue.length : 0;
  } catch {
    return 0;
  }
}

function render() {
  const enrolled = adminAuth.getBetaOptIn();
  statusEl.textContent = enrolled ? "You're enrolled in the beta." : "You're not enrolled in the beta.";
  statusEl.hidden = false;
  joinEl.hidden = enrolled;
  leaveEl.hidden = !enrolled;
  confirmBtn.textContent = enrolled ? "Leave the beta" : "Join the beta";

  const pending = pendingChangeCount();
  queueWarningEl.hidden = pending === 0;
  queueCountEl.textContent = `You have ${pending} ${pending === 1 ? "change" : "changes"} waiting to sync on this device.`;

  // Needs the server: offline, the button waits for a connection rather
  // than failing when pressed.
  const online = navigator.onLine;
  offlineNoteEl.hidden = online;
  confirmBtn.disabled = saving || !online;
  actionsEl.hidden = false;
}

function updateAdminBar() {
  syncAdminBar({ store, adminAuth, headerChrome: { updateMenuDivider } });
}

const adminAuth = createAdminAuth({
  store, adminFetch, isAuthRedirect,
  settingsUrl: SETTINGS_URL,
  updateAdminBar,
});

function showError(message) {
  errorEl.textContent = message;
  errorEl.hidden = false;
  errorEl.focus();
}

// Resolves to an error message, or null once the setting is saved.
async function saveEnrollment(join) {
  try {
    const result = await adminAuth.setBetaOptIn(join);
    if (result.ok) return null;
    return result.status
      ? `Couldn't ${join ? "join" : "leave"} the beta (error ${result.status}). Try again.`
      : "Your session has ended. Log in again, then try again.";
  } catch {
    return `Couldn't ${join ? "join" : "leave"} the beta. Check your connection and try again.`;
  }
}

confirmBtn.addEventListener("click", async () => {
  const join = !adminAuth.getBetaOptIn();
  errorEl.hidden = true;
  saving = true;
  render();
  const error = await saveEnrollment(join);
  if (error) {
    saving = false;
    render();
    showError(error);
    return;
  }
  // Join: to this page's owner's log in the beta. Leave: to the main
  // app's. Same-origin paths locally and on previews, where there's no
  // separate beta/my pair to switch between. The button stays disabled
  // while the next page loads.
  location.href = join ? resolveBetaXUrl(location.hostname, LOG_PATH) : resolveMyXUrl(location.hostname, LOG_PATH);
});

addEventListener("online", render);
addEventListener("offline", render);

createDisclosure(document.getElementById("header-menu-btn"), document.getElementById("header-menu-popover"), "#header-menu-wrap");
createThemeToggle();

async function boot() {
  await Promise.all([adminAuth.checkSession(), adminAuth.fetchSettings()]);
  updateAdminBar();
  render();
}

// #952/#960 -- boots only for the signed-in owner of this page and, on
// beta.<domain>, only if they're enrolled (client/boot-gate.js): someone
// not enrolled is sent to the main app's copy of this page to join.
pageAllowsBoot().then(allowed => {
  if (!allowed) return;
  // #947/#948 -- the service worker, once boot's own fetches have settled
  // and the page has gone idle.
  registerServiceWorker({ after: boot() });
});
