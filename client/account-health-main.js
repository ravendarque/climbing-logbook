import { createAccountShell } from "./account-shell.js";
import { resolveApexUrl } from "./resolve-cross-hostname-url.js";
import { startPage } from "./boot-gate.js";
import { PAIN_INJURY_WORDING } from "../shared/health-consent.js";

const CONSENT_URL = "/-/api/consent/pain-injury";

const { username: USERNAME, adminAuth, updateAdminBar } = createAccountShell();

document.getElementById("back-to-account-link").href = `/${encodeURIComponent(USERNAME)}/account`;
document.getElementById("health-help-link").href = resolveApexUrl(location.hostname, "/help/privacy/#health-data");

const statusEl = document.getElementById("health-status");
const updateEl = document.getElementById("health-update");
const updateChangesEl = document.getElementById("health-update-changes");
const grantEl = document.getElementById("health-grant");
const agreeBox = document.getElementById("health-agree");
const turnOnBtn = document.getElementById("health-turn-on-btn");
const withdrawEl = document.getElementById("health-withdraw");
const turnOffBtn = document.getElementById("health-turn-off-btn");
const confirmEl = document.getElementById("health-confirm");
const confirmTitle = document.getElementById("health-confirm-title");
const confirmCountEl = document.getElementById("health-confirm-count");
const confirmBackupsEl = document.getElementById("health-confirm-backups");
const confirmBtn = document.getElementById("health-confirm-btn");
const cancelBtn = document.getElementById("health-cancel-btn");
const offlineNoteEl = document.getElementById("health-offline-note");
const errorEl = document.getElementById("health-error");

document.getElementById("health-points").replaceChildren(
  ...PAIN_INJURY_WORDING.points.map(point => {
    const li = document.createElement("li");
    li.textContent = point;
    return li;
  }),
);
document.getElementById("health-statement").textContent = PAIN_INJURY_WORDING.statement;

let saving = false;
let confirming = false;
let notice = null;

const entriesPhrase = n => `${n} ${n === 1 ? "entry" : "entries"}`;

function render() {
  const on = adminAuth.hasPainInjuryConsent();
  const update = on ? adminAuth.getPainInjuryConsentUpdate() : null;
  const online = navigator.onLine;

  statusEl.textContent = notice ?? (on ? "Pain and injury tracking is on." : "Pain and injury tracking is off.");
  statusEl.hidden = false;

  updateEl.hidden = !update?.required;
  updateChangesEl.replaceChildren(
    ...(update?.changes ?? []).map(change => {
      const li = document.createElement("li");
      li.textContent = change;
      return li;
    }),
  );

  grantEl.hidden = confirming || (on && !update?.required);
  turnOnBtn.textContent = on ? "Agree" : "Turn on";
  turnOnBtn.disabled = saving || !online || !agreeBox.checked;

  withdrawEl.hidden = confirming || !on;
  turnOffBtn.disabled = saving || !online;
  confirmEl.hidden = !confirming;
  confirmBtn.disabled = saving || !online;

  offlineNoteEl.hidden = online;
}

function showError(message) {
  errorEl.textContent = message;
  errorEl.hidden = false;
  errorEl.focus();
}

function failureMessage(result, action) {
  if (!result.status) return "Your session has ended. Log in again, then try again.";
  if (result.status === 409) return "The wording on this page has changed. Reload the page to read it.";
  return `Couldn't ${action} (error ${result.status}). Try again.`;
}

async function run(action, label) {
  errorEl.hidden = true;
  saving = true;
  render();
  try {
    const result = await action();
    if (!result.ok) showError(failureMessage(result, label));
    return result;
  } catch {
    showError(`Couldn't ${label}. Check your connection and try again.`);
    return { ok: false };
  } finally {
    saving = false;
    render();
  }
}

agreeBox.addEventListener("change", render);

turnOnBtn.addEventListener("click", async () => {
  const wasOn = adminAuth.hasPainInjuryConsent();
  const result = await run(() => adminAuth.setPainInjuryConsent(true), "turn it on");
  if (!result.ok) return;
  agreeBox.checked = false;
  notice = wasOn ? "Thanks. Pain and injury tracking stays on." : "Pain and injury tracking is on.";
  render();
  statusEl.focus();
});

turnOffBtn.addEventListener("click", async () => {
  errorEl.hidden = true;
  let count;
  try {
    const res = await fetch(CONSENT_URL, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(String(res.status));
    count = (await res.json()).entriesWithPain;
  } catch {
    showError("Couldn't check what would be deleted. Check your connection and try again.");
    return;
  }
  confirmCountEl.textContent =
    count === 0
      ? "You have no pain or injury details logged, so there's nothing to delete."
      : `This deletes pain and injury details from ${entriesPhrase(count)}. The entries themselves stay.`;
  confirmBackupsEl.hidden = count === 0;
  confirming = true;
  render();
  confirmTitle.focus();
});

cancelBtn.addEventListener("click", () => {
  confirming = false;
  render();
  turnOffBtn.focus();
});

confirmBtn.addEventListener("click", async () => {
  const result = await run(() => adminAuth.setPainInjuryConsent(false), "turn it off");
  if (!result.ok) return;
  confirming = false;
  const deleted = result.data?.deleted ?? 0;
  notice =
    deleted === 0
      ? "Pain and injury tracking is off."
      : `Pain and injury tracking is off. Pain and injury details were deleted from ${entriesPhrase(deleted)}.`;
  render();
  statusEl.focus();
});

statusEl.tabIndex = -1;
addEventListener("online", render);
addEventListener("offline", render);

async function boot() {
  render();
  await Promise.all([adminAuth.checkSession(), adminAuth.fetchSettings()]);
  updateAdminBar();
  render();
}

startPage(boot);
