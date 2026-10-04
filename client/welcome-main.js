import { createAccountShell } from "./account-shell.js";
import { startPage } from "./boot-gate.js";
import { resolveMyXUrl } from "./resolve-cross-hostname-url.js";
import "./components/climbing-import.js";

const STEP_COUNT = 4;

const { username: USERNAME, adminAuth, updateAdminBar } = createAccountShell();
const USER_PATH = `/${encodeURIComponent(USERNAME)}`;

const steps = [...document.querySelectorAll("[data-step]")];
const progressLabel = document.getElementById("welcome-progress-label");
const progressSegments = [...document.getElementById("welcome-progress").children];
const backBtn = document.getElementById("welcome-back");
const nextBtn = document.getElementById("welcome-next");
const errorEl = document.getElementById("welcome-error");
const publicRadio = document.getElementById("welcome-public");
const privateRadio = document.getElementById("welcome-private");
const athleteOnRadio = document.getElementById("welcome-athlete-on");
const athleteOffRadio = document.getElementById("welcome-athlete-off");

const profileUrl = new URL(resolveMyXUrl(location.hostname, USER_PATH), location.origin);
document.getElementById("welcome-profile-url").textContent = profileUrl.host + profileUrl.pathname;

let step = 1;
let importedCount = 0;

function showError(message) {
  errorEl.textContent = message;
  errorEl.hidden = !message;
}

function render() {
  for (const section of steps) section.hidden = Number(section.dataset.step) !== step;
  progressLabel.textContent = `Step ${step} of ${STEP_COUNT}`;
  progressSegments.forEach((segment, i) => {
    segment.classList.toggle("bg-accent", i < step);
    segment.classList.toggle("bg-border", i >= step);
  });
  backBtn.hidden = step === 1;

  const skipping = step === 3 && importedCount === 0;
  nextBtn.textContent = step === STEP_COUNT ? "Go to my logbook" : skipping ? "Skip for now" : "Continue";
  nextBtn.classList.toggle("btn-primary", !skipping);

  if (step === STEP_COUNT) {
    document.getElementById("welcome-summary-visibility").textContent = publicRadio.checked ? "Public" : "Private";
    document.getElementById("welcome-summary-athlete").textContent = athleteOnRadio.checked ? "On" : "Off";
    document.getElementById("welcome-summary-import").textContent =
      importedCount === 0 ? "Skipped" : `${importedCount} ${importedCount === 1 ? "entry" : "entries"}`;
  }
}

function goTo(next) {
  step = next;
  showError("");
  render();
  steps[step - 1].querySelector("h1").focus();
}

async function saveChoice(setter, value, label, revert) {
  showError("");
  let ok = false;
  try {
    ok = (await setter(value)).ok;
  } catch {}
  if (!ok) {
    revert();
    showError(`Couldn't save ${label}. Check your connection and try again.`);
  }
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

document.querySelector("climbing-import").addEventListener("import-complete", e => {
  importedCount += e.detail.imported;
  render();
});

backBtn.addEventListener("click", () => goTo(step - 1));

nextBtn.addEventListener("click", async () => {
  if (step < STEP_COUNT) {
    goTo(step + 1);
    return;
  }
  nextBtn.disabled = true;
  showError("");
  let ok = false;
  try {
    ok = (await adminAuth.completeOnboarding()).ok;
  } catch {}
  if (ok) {
    window.location.href = `${USER_PATH}/log`;
    return;
  }
  nextBtn.disabled = false;
  showError("Couldn't finish setting up. Check your connection and try again.");
});

async function boot() {
  await Promise.all([adminAuth.checkSession(), adminAuth.fetchSettings()]);
  updateAdminBar();
  (adminAuth.isLogbookPublic() ? publicRadio : privateRadio).checked = true;
  (adminAuth.isAthleteMode() ? athleteOnRadio : athleteOffRadio).checked = true;
  render();
}

render();
startPage(boot);
