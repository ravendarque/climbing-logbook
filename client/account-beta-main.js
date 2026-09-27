import { createAccountShell } from "./account-shell.js";
import { resolveApexUrl, resolveBetaXUrl, resolveMyXUrl } from "./resolve-cross-hostname-url.js";
import { userKey } from "./user-storage.js";
import { startPage } from "./boot-gate.js";

const QUEUE_KEY = userKey("logbook_pending_queue");

const { username: USERNAME, adminAuth, updateAdminBar } = createAccountShell();
const LOG_PATH = `/${encodeURIComponent(USERNAME)}/log`;

document.getElementById("back-to-account-link").href = `/${encodeURIComponent(USERNAME)}/account`;
document.getElementById("beta-help-link").href = resolveApexUrl(location.hostname, "/help/beta-channel/");

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

function showError(message) {
  errorEl.textContent = message;
  errorEl.hidden = false;
  errorEl.focus();
}

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
  // Same-origin locally and on previews, where there's no separate beta and my. pair.
  location.href = join ? resolveBetaXUrl(location.hostname, LOG_PATH) : resolveMyXUrl(location.hostname, LOG_PATH);
});

addEventListener("online", render);
addEventListener("offline", render);

async function boot() {
  await Promise.all([adminAuth.checkSession(), adminAuth.fetchSettings()]);
  updateAdminBar();
  render();
}

startPage(boot);
