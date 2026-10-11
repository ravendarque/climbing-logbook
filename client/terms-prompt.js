import { escapeHtml } from "./escape-html.js";
import { userKey } from "./user-storage.js";

const LATER_KEY = userKey("logbook_terms_later");
export const TERMS_AGREED_EVENT = "terms-agreed";

const formatDate = iso =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

function putOffFor(version) {
  try {
    return localStorage.getItem(LATER_KEY) === version;
  } catch {
    return false;
  }
}

function putOff(version) {
  try {
    localStorage.setItem(LATER_KEY, version);
  } catch {}
}

function dialogHtml({ effective, required, changes }) {
  const when = required
    ? "Until you agree, you can still see your logbook, export it or delete your account, but nothing new is saved. Anything you add waits on this device."
    : `The changes take effect on ${escapeHtml(formatDate(effective))}. You can agree now or later.`;
  return `<div class="flex flex-col gap-3">
    <h2 class="font-display text-2xl tracking-wide" id="terms-prompt-title">We're updating our terms of use</h2>
    <p class="text-sm text-muted">${when}</p>
    <p class="text-sm">What's changed:</p>
    <ul class="list-disc pl-5 text-sm flex flex-col gap-1">${changes.map(change => `<li>${escapeHtml(change)}</li>`).join("")}</ul>
    <p class="text-sm"><a class="text-accent-ink underline underline-offset-2" href="/help/terms/" target="_blank" rel="noopener">Read the Terms of use</a></p>
    <p class="text-sm error-message" id="terms-prompt-error" role="alert" hidden></p>
    <div class="flex flex-wrap justify-end gap-2">
      ${required ? "" : `<button type="button" class="btn" id="terms-later-btn">Later</button>`}
      <button type="button" class="btn btn-primary disabled:opacity-[.45] disabled:cursor-not-allowed" id="terms-agree-btn">I agree</button>
    </div>
  </div>`;
}

async function agree(version) {
  try {
    const res = await fetch("/-/api/terms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version }),
    });
    if (res.ok) return null;
    const data = await res.json().catch(() => null);
    return data?.error || `Couldn't record your agreement (${res.status}).`;
  } catch {
    return "Network error -- check your connection and try again.";
  }
}

let shown = null;

// Asked on every page until agreed; an update still in its notice period can be put off until the next version.
export function showTermsPrompt(update) {
  if (!update || shown) return;
  if (!update.required && putOffFor(update.version)) return;

  const dialog = document.createElement("dialog");
  dialog.className =
    "m-auto w-[calc(100%-2rem)] max-w-[28rem] p-5 bg-background text-foreground border border-border rounded-app backdrop:bg-[color-mix(in_srgb,black_60%,transparent)]";
  dialog.setAttribute("aria-labelledby", "terms-prompt-title");
  dialog.innerHTML = dialogHtml(update);
  document.body.append(dialog);
  shown = dialog;

  const agreeBtn = dialog.querySelector("#terms-agree-btn");
  const errorEl = dialog.querySelector("#terms-prompt-error");

  dialog.addEventListener("cancel", event => {
    if (update.required) event.preventDefault();
  });
  let settled = false;
  function dismiss() {
    settled = true;
    dialog.close();
    dialog.remove();
  }
  function putOffAndDismiss() {
    putOff(update.version);
    dismiss();
  }

  // Chrome lets Escape close a dialog despite preventDefault until the page has had a click or key press.
  dialog.addEventListener("close", () => {
    if (settled) return;
    if (update.required) dialog.showModal();
    else putOffAndDismiss();
  });
  dialog.querySelector("#terms-later-btn")?.addEventListener("click", putOffAndDismiss);
  agreeBtn.addEventListener("click", async () => {
    agreeBtn.disabled = true;
    errorEl.hidden = true;
    const error = await agree(update.version);
    agreeBtn.disabled = false;
    if (error) {
      errorEl.textContent = error;
      errorEl.hidden = false;
      return;
    }
    dismiss();
    window.dispatchEvent(new Event(TERMS_AGREED_EVENT));
  });

  dialog.showModal();
}
