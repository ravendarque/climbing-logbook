import { createAccountShell } from "./account-shell.js";
import { startPage } from "./boot-gate.js";
import "./components/climbing-import.js";

const { username: USERNAME, adminAuth, updateAdminBar } = createAccountShell();

document.getElementById("back-to-account-link").href = `/${encodeURIComponent(USERNAME)}/account`;

async function boot() {
  await Promise.all([adminAuth.checkSession(), adminAuth.fetchSettings()]);
  updateAdminBar();
}

startPage(boot);
