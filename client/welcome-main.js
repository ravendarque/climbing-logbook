import { createAccountShell } from "./account-shell.js";
import { startPage } from "./boot-gate.js";
import { resolveApexUrl, resolveMyXUrl } from "./resolve-cross-hostname-url.js";
import "./components/climbing-import.js";
import { tourStartUrl } from "./tour/tour-url.js";
import { PAIN_INJURY_WORDING } from "../shared/health-consent.js";
import { renderAgreementPoints } from "./health-agreement.js";

const { username: USERNAME, adminAuth, updateAdminBar } = createAccountShell();
const USER_PATH = `/${encodeURIComponent(USERNAME)}`;

const sections = [...document.querySelectorAll("[data-step]")];
const progressLabel = document.getElementById("welcome-progress-label");
const progressSegments = [...document.getElementById("welcome-progress").children];
const backBtn = document.getElementById("welcome-back");
const nextBtn = document.getElementById("welcome-next");
const errorEl = document.getElementById("welcome-error");
const publicRadio = document.getElementById("welcome-public");
const privateRadio = document.getElementById("welcome-private");
const athleteOnRadio = document.getElementById("welcome-athlete-on");
const athleteOffRadio = document.getElementById("welcome-athlete-off");
const importSection = document.querySelector('[aria-labelledby="welcome-import-title"]');
const healthOnRadio = document.getElementById("welcome-health-on");
const healthOffRadio = document.getElementById("welcome-health-off");
const healthChoice = document.getElementById("welcome-health-choice");
const healthAlreadyOn = document.getElementById("welcome-health-already-on");
const healthStatementRow = document.getElementById("welcome-health-statement-row");
const healthAgree = document.getElementById("welcome-health-agree");
const healthSection = healthChoice.closest("[data-step]");

const profileUrl = new URL(resolveMyXUrl(location.hostname, USER_PATH), location.origin);
document.getElementById("welcome-profile-url").textContent = profileUrl.host + profileUrl.pathname;
document.getElementById("welcome-health-help-link").href = resolveApexUrl(
  location.hostname,
  "/help/privacy/#health-data",
);
renderAgreementPoints(document.getElementById("welcome-health-points"), PAIN_INJURY_WORDING.points);
document.getElementById("welcome-health-statement").textContent = PAIN_INJURY_WORDING.statement;

let current = sections[0];
let importedCount = 0;
let saving = false;

const visibleSections = () =>
  sections.filter(section => !("needsAthleteMode" in section.dataset) || athleteOnRadio.checked);

function showError(message) {
  errorEl.textContent = message;
  errorEl.hidden = !message;
}

function canContinue() {
  if (saving) return false;
  if (current !== healthSection || adminAuth.hasPainInjuryConsent()) return true;
  if (healthOffRadio.checked) return true;
  return healthOnRadio.checked && healthAgree.checked;
}

function render() {
  const visible = visibleSections();
  const index = visible.indexOf(current);
  const last = index === visible.length - 1;
  for (const section of sections) section.hidden = section !== current;
  progressLabel.textContent = `Step ${index + 1} of ${visible.length}`;
  progressSegments.forEach((segment, i) => {
    segment.hidden = i >= visible.length;
    segment.classList.toggle("bg-accent", i <= index);
    segment.classList.toggle("bg-border", i > index);
  });
  backBtn.hidden = index === 0;

  const consented = adminAuth.hasPainInjuryConsent();
  healthChoice.hidden = consented;
  healthAlreadyOn.hidden = !consented;
  healthStatementRow.hidden = consented || !healthOnRadio.checked;

  const skipping = current === importSection && importedCount === 0;
  nextBtn.textContent = last ? "Go to my logbook" : skipping ? "Skip for now" : "Continue";
  nextBtn.classList.toggle("btn-primary", !skipping);
  nextBtn.disabled = !canContinue();

  if (last) {
    document.getElementById("welcome-summary-visibility").textContent = publicRadio.checked ? "Public" : "Private";
    document.getElementById("welcome-summary-athlete").textContent = athleteOnRadio.checked ? "On" : "Off";
    document.getElementById("welcome-summary-health-row").hidden = !athleteOnRadio.checked && !consented;
    document.getElementById("welcome-summary-health").textContent = consented ? "On" : "Off";
    document.getElementById("welcome-summary-import").textContent =
      importedCount === 0 ? "Skipped" : `${importedCount} ${importedCount === 1 ? "entry" : "entries"}`;
  }
}

function goTo(section) {
  current = section;
  showError("");
  render();
  current.querySelector("h1").focus();
}

// Continue waits for the save, so a reverted Athlete Mode can't hide the step the user has moved on to.
async function saveChoice(setter, value, label, revert) {
  showError("");
  saving = true;
  render();
  let ok = false;
  try {
    ok = (await setter(value)).ok;
  } catch {}
  saving = false;
  if (!ok) {
    revert();
    showError(`Couldn't save ${label}. Check your connection and try again.`);
  }
  render();
}

for (const radio of [publicRadio, privateRadio]) {
  radio.addEventListener("change", () => {
    const wasPublic = !publicRadio.checked;
    saveChoice(adminAuth.setLogbookPublic, publicRadio.checked, "who can see your logbook", () => {
      (wasPublic ? publicRadio : privateRadio).checked = true;
    });
  });
}

for (const radio of [athleteOnRadio, athleteOffRadio]) {
  radio.addEventListener("change", () => {
    const wasOn = !athleteOnRadio.checked;
    saveChoice(adminAuth.setAthleteMode, athleteOnRadio.checked, "Athlete Mode", () => {
      (wasOn ? athleteOnRadio : athleteOffRadio).checked = true;
    });
  });
}

for (const input of [healthOnRadio, healthOffRadio, healthAgree]) input.addEventListener("change", render);

document.querySelector("climbing-import").addEventListener("import-complete", e => {
  importedCount += e.detail.imported;
  render();
});

const step = offset => {
  const visible = visibleSections();
  return visible[visible.indexOf(current) + offset];
};

backBtn.addEventListener("click", () => goTo(step(-1)));

async function grantConsent() {
  saving = true;
  render();
  let ok = false;
  try {
    ok = (await adminAuth.setPainInjuryConsent(true)).ok;
  } catch {}
  saving = false;
  if (!ok) showError("Couldn't turn on health data. Check your connection and try again.");
  render();
  return ok;
}

nextBtn.addEventListener("click", async () => {
  const next = step(1);
  if (next) {
    const granting = current === healthSection && healthOnRadio.checked && !adminAuth.hasPainInjuryConsent();
    if (granting && !(await grantConsent())) return;
    goTo(next);
    return;
  }
  nextBtn.disabled = true;
  showError("");
  let ok = false;
  try {
    ok = (await adminAuth.completeOnboarding()).ok;
  } catch {}
  if (ok) {
    window.location.href = tourStartUrl(`${USER_PATH}/log`);
    return;
  }
  nextBtn.disabled = false;
  showError("Couldn't finish setting up. Check your connection and try again.");
});

async function boot() {
  await Promise.all([adminAuth.checkSession(), adminAuth.fetchSettings()]);
  if (adminAuth.isOnboardingCompleted()) {
    window.location.replace(`${USER_PATH}/log`);
    return;
  }
  updateAdminBar();
  (adminAuth.isLogbookPublic() ? publicRadio : privateRadio).checked = true;
  (adminAuth.isAthleteMode() ? athleteOnRadio : athleteOffRadio).checked = true;
  render();
}

render();
startPage(boot);
