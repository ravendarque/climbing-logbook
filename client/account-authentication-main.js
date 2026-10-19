import { createAccountShell } from "./account-shell.js";
import { startPage } from "./boot-gate.js";
import { authRequest } from "./auth-request.js";
import { createDetailsSection } from "./account-details.js";
import { createTwoStepSection } from "./account-two-step.js";
import { createPasskeysSection } from "./account-passkeys.js";

const { username, adminAuth, updateAdminBar } = createAccountShell();
document.getElementById("back-to-account-link").href = `/${encodeURIComponent(username)}/account`;

const details = createDetailsSection({ username });
const twoStep = createTwoStepSection();
const passkeys = createPasskeysSection();

async function boot() {
  await Promise.all([adminAuth.checkSession(), adminAuth.fetchSettings()]);
  updateAdminBar();
  details.show(adminAuth);
  const sessionRequest = authRequest("/get-session");
  await Promise.all([twoStep.load(sessionRequest), passkeys.load(sessionRequest)]);
}

startPage(boot);
