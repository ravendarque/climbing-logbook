import { createAccountShell } from "./account-shell.js";
import { resolveApexUrl } from "./resolve-cross-hostname-url.js";
import { startPage } from "./boot-gate.js";
import { PAIN_INJURY_WORDING } from "../shared/health-consent.js";

const { username: USERNAME, adminAuth, updateAdminBar } = createAccountShell();

document.getElementById("back-to-account-link").href = `/${encodeURIComponent(USERNAME)}/account`;
document.getElementById("health-help-link").href = resolveApexUrl(location.hostname, "/help/privacy/#health-data");

const titleEl = document.getElementById("health-title");
const countEl = document.getElementById("health-count");
const updateEl = document.getElementById("health-update");
const updateChangesEl = document.getElementById("health-update-changes");
const grantEl = document.getElementById("health-grant");
const agreeBox = document.getElementById("health-agree");
const turnOnBtn = document.getElementById("health-turn-on-btn");
const withdrawEl = document.getElementById("health-withdraw");
const turnOffBtn = document.getElementById("health-turn-off-btn");
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

function render() {
  const on = adminAuth.hasPainInjuryConsent();
  const update = on ? adminAuth.getPainInjuryConsentUpdate() : null;
  const online = navigator.onLine;

  updateEl.hidden = !update?.required;
  updateChangesEl.replaceChildren(
    ...(update?.changes ?? []).map(change => {
      const li = document.createElement("li");
      li.textContent = change;
      return li;
    }),
  );

  grantEl.hidden = on && !update?.required;
  turnOnBtn.textContent = on ? "Agree" : "Turn on";
  turnOnBtn.disabled = saving || !online || !agreeBox.checked;

  withdrawEl.hidden = !on;
  turnOffBtn.disabled = saving || !online;

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
  const result = await run(() => adminAuth.setPainInjuryConsent(true), "turn it on");
  if (!result.ok) return;
  agreeBox.checked = false;
  render();
  titleEl.focus();
  showCount();
});

turnOffBtn.addEventListener("click", async () => {
  const result = await run(() => adminAuth.setPainInjuryConsent(false), "turn it off");
  if (!result.ok) return;
  render();
  titleEl.focus();
});

// Advisory: the warning still says what's deleted if the count can't load.
async function showCount() {
  countEl.hidden = true;
  if (!adminAuth.hasPainInjuryConsent()) return;
  try {
    const res = await fetch("/-/api/consent/pain-injury", { headers: { Accept: "application/json" } });
    if (!res.ok) return;
    const n = (await res.json()).entriesWithPain;
    countEl.textContent =
      n === 0
        ? "You have no pain or injury details logged yet."
        : `You have pain and injury details on ${n} ${n === 1 ? "entry" : "entries"}.`;
    countEl.hidden = false;
  } catch {}
}

addEventListener("online", render);
addEventListener("offline", render);

async function boot() {
  render();
  await Promise.all([adminAuth.checkSession(), adminAuth.fetchSettings()]);
  updateAdminBar();
  render();
  showCount();
}

startPage(boot);
