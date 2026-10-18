import { createAccountShell } from "./account-shell.js";
import { startPage } from "./boot-gate.js";
import { addPasskey, isCancelled, listPasskeys, passkeysSupported, removePasskey, renamePasskey } from "./passkeys.js";

const { username: USERNAME, adminAuth, updateAdminBar } = createAccountShell();
document.getElementById("back-to-account-link").href = `/${encodeURIComponent(USERNAME)}/account`;

const $ = id => document.getElementById(id);
const list = $("passkeys-list");
const empty = $("passkeys-empty");
const form = $("add-passkey-form");
const nameInput = $("passkey-name");
const errorEl = $("passkeys-error");
const infoEl = $("passkeys-info");

const addedOn = value =>
  new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

function showError(message) {
  errorEl.textContent = message;
  errorEl.hidden = false;
  errorEl.focus();
}

function showInfo(message) {
  infoEl.textContent = message;
  infoEl.hidden = !message;
}

function button(label, onClick, className = "btn") {
  const el = document.createElement("button");
  el.type = "button";
  el.className = `${className} shrink-0`;
  el.textContent = label;
  el.addEventListener("click", onClick);
  return el;
}

function passkeyItem(passkey) {
  const item = document.createElement("li");
  item.className = "row-card flex flex-wrap items-center gap-3";
  const text = document.createElement("div");
  text.className = "flex-1 min-w-0";
  const title = document.createElement("span");
  title.className = "row-card-title break-words";
  title.textContent = passkey.name || "Passkey";
  const meta = document.createElement("p");
  meta.className = "text-sm text-muted mt-1";
  meta.textContent = passkey.createdAt ? `Added ${addedOn(passkey.createdAt)}` : "";
  text.append(title, meta);

  const rename = document.createElement("form");
  rename.className = "flex flex-wrap items-center gap-2 w-full";
  rename.hidden = true;
  const renameInput = document.createElement("input");
  renameInput.className = "text-input flex-1 min-w-0";
  renameInput.maxLength = 50;
  renameInput.setAttribute("aria-label", "New name");
  const save = document.createElement("button");
  save.type = "submit";
  save.className = "btn btn-primary shrink-0";
  save.textContent = "Save";
  rename.append(
    renameInput,
    save,
    button("Cancel", () => toggleRename(false)),
  );

  function toggleRename(open) {
    rename.hidden = !open;
    actions.hidden = open;
    if (open) {
      renameInput.value = passkey.name ?? "";
      renameInput.focus();
    }
  }

  rename.addEventListener("submit", async event => {
    event.preventDefault();
    errorEl.hidden = true;
    const name = renameInput.value.trim();
    if (!name) return showError("Give the passkey a name.");
    try {
      await renamePasskey(passkey.id, name);
      await render();
    } catch (err) {
      showError(err.message);
    }
  });

  const actions = document.createElement("div");
  actions.className = "flex gap-2";
  actions.append(
    button("Rename", () => toggleRename(true)),
    button(
      "Remove",
      async () => {
        errorEl.hidden = true;
        try {
          await removePasskey(passkey.id);
          showInfo(`Removed ${passkey.name || "the passkey"}. It can't be used to log in any more.`);
          await render();
        } catch (err) {
          showError(err.message);
        }
      },
      "btn btn-danger",
    ),
  );
  item.append(text, actions, rename);
  return item;
}

async function render() {
  const passkeys = await listPasskeys();
  list.replaceChildren(...passkeys.map(passkeyItem));
  list.hidden = passkeys.length === 0;
  empty.hidden = passkeys.length > 0;
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  errorEl.hidden = true;
  showInfo("");
  const name = nameInput.value.trim();
  if (!name) return showError("Give the passkey a name, such as the device it's on.");
  $("add-passkey-btn").disabled = true;
  try {
    await addPasskey(name);
    nameInput.value = "";
    showInfo(`Added ${name}. Next time, choose "Log in with a passkey".`);
    await render();
  } catch (err) {
    if (!isCancelled(err)) showError(err.message);
  } finally {
    $("add-passkey-btn").disabled = false;
  }
});

async function boot() {
  await Promise.all([adminAuth.checkSession(), adminAuth.fetchSettings()]);
  updateAdminBar();
  if (!passkeysSupported()) {
    $("passkeys-loading").hidden = true;
    $("passkeys-unsupported").hidden = false;
    return;
  }
  try {
    await render();
    $("passkeys-loading").hidden = true;
    form.hidden = false;
  } catch {
    $("passkeys-loading").textContent = "Couldn't load your passkeys. Check your connection and try again.";
  }
}

startPage(boot);
