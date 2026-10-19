import { renderSVG } from "uqr";
import { authRequest } from "./auth-request.js";

const PASSWORD_PROMPTS = {
  enable: "Enter your password to set up 2FA.",
  codes: "Enter your password to get new backup codes. Your old ones will stop working.",
  disable: "Enter your password to turn off 2FA.",
};

export function createTwoStepSection() {
  const $ = id => document.getElementById(id);
  const loading = $("two-step-loading");
  const offSection = $("two-step-off");
  const onSection = $("two-step-on");
  const passwordForm = $("two-step-password-form");
  const passwordInput = $("two-step-password");
  const passwordPrompt = $("two-step-password-prompt");
  const scanForm = $("scan-form");
  const codesSection = $("backup-codes");
  const codesList = $("backup-codes-list");
  const errorEl = $("two-step-error");
  const infoEl = $("two-step-info");
  const pending = $("recovery-pending");

  let enabled = false;
  let passwordAction = null;
  let backupCodes = [];

  function showError(message) {
    errorEl.textContent = message;
    errorEl.hidden = false;
    errorEl.focus();
  }

  function showInfo(message) {
    infoEl.textContent = message;
    infoEl.hidden = !message;
  }

  function show(panel) {
    for (const el of [offSection, onSection, passwordForm, scanForm, codesSection]) el.hidden = el !== panel;
    if (panel === null) (enabled ? onSection : offSection).hidden = false;
  }

  function askPassword(action) {
    passwordAction = action;
    passwordPrompt.textContent = PASSWORD_PROMPTS[action];
    passwordInput.value = "";
    errorEl.hidden = true;
    showInfo("");
    show(passwordForm);
    passwordInput.focus();
  }

  function showBackupCodes(codes) {
    backupCodes = codes;
    codesList.replaceChildren(
      ...codes.map(code => {
        const li = document.createElement("li");
        li.textContent = code;
        return li;
      }),
    );
    show(codesSection);
  }

  passwordForm.addEventListener("submit", async event => {
    event.preventDefault();
    errorEl.hidden = true;
    const password = passwordInput.value;
    try {
      if (passwordAction === "enable") {
        const { totpURI, backupCodes: codes } = await authRequest("/two-factor/enable", { password });
        backupCodes = codes;
        $("qr-code").innerHTML = renderSVG(totpURI);
        $("setup-key").textContent = new URL(totpURI).searchParams.get("secret") ?? "";
        $("setup-code").value = "";
        show(scanForm);
        $("setup-code").focus();
      } else if (passwordAction === "codes") {
        const { backupCodes: codes } = await authRequest("/two-factor/generate-backup-codes", { password });
        showBackupCodes(codes);
      } else {
        await authRequest("/two-factor/disable", { password });
        enabled = false;
        show(null);
        showInfo("2FA is off. You'll log in with just your password.");
      }
    } catch (err) {
      showError(err.code === "INVALID_PASSWORD" ? "That password isn't right." : err.message);
    } finally {
      passwordInput.value = "";
    }
  });

  scanForm.addEventListener("submit", async event => {
    event.preventDefault();
    errorEl.hidden = true;
    try {
      await authRequest("/two-factor/verify-totp", { code: $("setup-code").value.trim() });
      enabled = true;
      showBackupCodes(backupCodes);
    } catch {
      showError("That code didn't work. Check the app shows Climbing Logbook, then enter the code it shows now.");
    }
  });

  $("setup-start-btn").addEventListener("click", () => askPassword("enable"));
  $("new-codes-btn").addEventListener("click", () => askPassword("codes"));
  $("turn-off-btn").addEventListener("click", () => askPassword("disable"));
  for (const id of ["two-step-password-cancel-btn", "setup-cancel-btn"]) {
    $(id).addEventListener("click", () => {
      errorEl.hidden = true;
      show(null);
    });
  }

  $("copy-codes-btn").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(backupCodes.join("\n"));
      showInfo("Copied. Paste them somewhere safe.");
    } catch {
      showInfo("Couldn't copy them. Select the codes and copy them yourself.");
    }
  });

  $("codes-done-btn").addEventListener("click", () => {
    backupCodes = [];
    codesList.replaceChildren();
    show(null);
    showInfo("");
  });

  $("recovery-cancel-btn").addEventListener("click", async () => {
    try {
      await authRequest("/two-factor/recovery/cancel-mine", {});
      pending.hidden = true;
      showInfo("Cancelled. 2FA stays on.");
    } catch (err) {
      showError(err.message);
    }
  });

  return {
    async load(sessionRequest) {
      try {
        const [session, recovery] = await Promise.all([sessionRequest, authRequest("/two-factor/recovery/pending")]);
        enabled = !!session?.user?.twoFactorEnabled;
        if (recovery.effectiveAt) {
          const date = new Date(recovery.effectiveAt).toLocaleDateString("en-GB", {
            weekday: "long",
            day: "numeric",
            month: "long",
          });
          $("recovery-pending-text").textContent =
            `Someone used the "lost your device" link, so 2FA switches off on ${date}. If that wasn't you, cancel it and change your password.`;
          pending.hidden = false;
        }
        loading.hidden = true;
        show(null);
      } catch {
        loading.textContent = "Couldn't load this. Check your connection and try again.";
      }
    },
  };
}
