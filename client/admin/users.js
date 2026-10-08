import { SAVE_ERROR, addField, api, cardClass, el, formatDate, onPlainClick } from "./shared.js";

const SEARCH_DELAY_MS = 250;

const CONFIRMATIONS = {
  delete: {
    title: username => `Delete ${username}?`,
    text: "Their account, climbs, places and settings are removed for good. Their reports and feedback stay, without their name.",
    button: "Delete",
  },
  ban: {
    title: username => `Ban ${username}?`,
    text: "Their account and everything in it are removed for good, and their email and username can never be used to register again.",
    button: "Ban",
  },
};

const STATUSES = { send: "Send", project: "Project", archived: "Archived", checkout: "Check out" };
const DISCIPLINES = { boulder: "Boulder", sport: "Sport" };

function logbookItem(entry) {
  const item = el("li", "flex flex-col gap-1 py-3 border-b border-border");
  const top = el("span", "flex flex-wrap items-baseline gap-x-2");
  top.append(el("span", "text-sm font-bold break-words", entry.name), el("span", "text-sm", entry.grade));
  if (entry.hidden) top.append(el("span", "ml-auto text-xs font-semibold text-accent-ink", "Hidden"));
  const status = entry.status === "send" && entry.firstAttempt ? "Flash" : (STATUSES[entry.status] ?? entry.status);
  const place = [entry.area, entry.location, entry.country].filter(Boolean).join(", ");
  item.append(
    top,
    el(
      "span",
      "text-xs text-muted",
      [entry.date, DISCIPLINES[entry.discipline] ?? entry.discipline, status, place].filter(Boolean).join(" · "),
    ),
  );
  if (entry.notes) item.append(el("p", "text-sm whitespace-pre-wrap break-words", entry.notes));
  // Shown, not linked, as in a report.
  if (entry.video) item.append(el("span", "text-xs text-muted break-all", entry.video));
  return item;
}

function summary(user) {
  const climbs = `${user.climbs} ${user.climbs === 1 ? "climb" : "climbs"}`;
  return [
    `Joined ${formatDate(user.createdAt, { withYear: true, withTime: false })}`,
    climbs,
    user.logbookPublic ? "Public" : "Private",
  ].join(" · ");
}

export function startUsers() {
  const listPane = document.getElementById("user-list-pane");
  const listStatus = document.getElementById("user-status");
  const list = document.getElementById("user-list");
  const search = document.getElementById("user-search");
  const detailPane = document.getElementById("user-detail");
  const fields = document.getElementById("user-fields");
  const actions = document.getElementById("user-actions");
  const demoNote = document.getElementById("user-demo-note");
  const error = document.getElementById("user-error");
  const toggleSuspend = document.getElementById("toggle-suspend");
  const dialog = document.getElementById("user-dialog");
  const confirmInput = document.getElementById("user-confirm");
  const confirmButton = document.getElementById("user-dialog-confirm");
  const viewLogbook = document.getElementById("view-logbook");
  const logbookStatus = document.getElementById("logbook-status");
  const logbookList = document.getElementById("logbook-list");

  const params = new URLSearchParams(location.search);
  let query = params.get("q") ?? "";
  let selectedId = params.get("id");
  let users = [];
  let pendingAction = null;
  let searchTimer = 0;
  let logbookUserId = null;
  search.value = query;

  function urlFor({ id = selectedId } = {}) {
    const next = new URLSearchParams();
    if (query) next.set("q", query);
    if (id) next.set("id", id);
    const text = next.toString();
    return `/users${text ? `?${text}` : ""}`;
  }

  function selected() {
    return users.find(user => user.id === selectedId);
  }

  function renderList() {
    list.replaceChildren(
      ...users.map(user => {
        const item = el("li");
        const link = el("a", cardClass(user.id === selectedId));
        link.href = urlFor({ id: user.id });
        link.dataset.id = user.id;
        if (user.id === selectedId) link.setAttribute("aria-current", "true");

        const top = el("span", "flex items-center gap-2");
        top.append(el("span", "text-sm font-bold break-all", user.username));
        if (user.suspended) top.append(el("span", "ml-auto text-xs font-semibold text-accent-ink", "Suspended"));
        if (user.isDemo) top.append(el("span", "ml-auto text-xs text-muted", "Demo"));
        link.append(
          top,
          el("span", "text-sm text-muted break-all", user.email),
          el("span", "text-xs text-muted", summary(user)),
        );
        item.append(link);
        return item;
      }),
    );
    listStatus.textContent = users.length ? "" : query ? "No one matches that." : "No one has signed up yet.";
  }

  function renderDetail() {
    const user = selected();
    detailPane.hidden = !user;
    listPane.classList.toggle("max-[899px]:hidden", !!user);
    error.hidden = true;
    if (!user) return;

    document.getElementById("user-back").href = urlFor({ id: null });
    document.getElementById("user-heading").textContent = user.username;
    fields.replaceChildren();
    addField(fields, "Email", user.email);
    addField(fields, "Joined", formatDate(user.createdAt, { withYear: true }));
    addField(
      fields,
      "Last seen",
      user.lastSeenAt ? formatDate(user.lastSeenAt, { withYear: true }) : "No current session",
    );
    addField(fields, "Climbs", String(user.climbs));
    addField(fields, "Logbook", user.logbookPublic ? "Public" : "Private");
    addField(fields, "Status", user.suspended ? "Suspended" : "Active");

    actions.hidden = user.isDemo;
    demoNote.hidden = !user.isDemo;
    toggleSuspend.textContent = user.suspended ? "Unsuspend" : "Suspend";
    if (logbookUserId !== user.id) {
      logbookUserId = user.id;
      logbookList.replaceChildren();
      logbookStatus.textContent = "";
    }
  }

  function render() {
    renderList();
    renderDetail();
  }

  function navigate(url, { replace = false } = {}) {
    history[replace ? "replaceState" : "pushState"](null, "", url);
    selectedId = new URLSearchParams(location.search).get("id");
    render();
  }

  async function load() {
    listStatus.textContent = "Loading…";
    try {
      ({ users } = await api(`users${query ? `?q=${encodeURIComponent(query)}` : ""}`));
    } catch {
      users = [];
      list.replaceChildren();
      listStatus.textContent = "Couldn't load these. Check your connection and reload.";
      return;
    }
    render();
  }

  function showError(message) {
    error.textContent = message;
    error.hidden = false;
  }

  async function post(user, action, body) {
    return api(`users/${encodeURIComponent(user.id)}/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
  }

  onPlainClick(list, "a[data-id]", link => navigate(urlFor({ id: link.dataset.id })));
  onPlainClick(detailPane, "#user-back", () => navigate(urlFor({ id: null })));

  search.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      query = search.value.trim();
      navigate(urlFor(), { replace: true });
      load();
    }, SEARCH_DELAY_MS);
  });

  viewLogbook.addEventListener("click", async () => {
    const user = selected();
    if (!user) return;
    logbookList.replaceChildren();
    logbookStatus.textContent = "Loading…";
    try {
      const { entries } = await api(`users/${encodeURIComponent(user.id)}/logbook`);
      if (selected()?.id !== user.id) return;
      logbookList.replaceChildren(...entries.map(logbookItem));
      logbookStatus.textContent = entries.length
        ? `${entries.length} ${entries.length === 1 ? "climb" : "climbs"}`
        : "No climbs yet.";
    } catch {
      logbookStatus.textContent = "Couldn't load this logbook. Check your connection and try again.";
    }
  });

  toggleSuspend.addEventListener("click", async () => {
    const user = selected();
    error.hidden = true;
    try {
      const updated = await post(user, user.suspended ? "unsuspend" : "suspend");
      users = users.map(u => (u.id === updated.id ? updated : u));
      render();
    } catch {
      showError(SAVE_ERROR);
    }
  });

  // Escape leaves returnValue as it was, so it's cleared on every opening.
  function confirm(action) {
    const user = selected();
    const copy = CONFIRMATIONS[action];
    pendingAction = action;
    document.getElementById("user-dialog-title").textContent = copy.title(user.username);
    document.getElementById("user-dialog-text").textContent = copy.text;
    confirmButton.textContent = copy.button;
    confirmInput.value = "";
    confirmButton.disabled = true;
    dialog.returnValue = "";
    dialog.showModal();
  }

  document.getElementById("user-delete").addEventListener("click", () => confirm("delete"));
  document.getElementById("user-ban").addEventListener("click", () => confirm("ban"));
  confirmInput.addEventListener("input", () => {
    confirmButton.disabled = confirmInput.value.trim().toLowerCase() !== selected().username.toLowerCase();
  });

  dialog.addEventListener("close", async () => {
    if (dialog.returnValue !== "confirm") return;
    const user = selected();
    try {
      await post(user, pendingAction, { confirm: confirmInput.value.trim() });
      users = users.filter(u => u.id !== user.id);
      navigate(urlFor({ id: null }));
    } catch {
      showError(`Couldn't ${pendingAction} ${user.username}. Check your connection and try again.`);
    }
  });

  window.addEventListener("popstate", () => {
    selectedId = new URLSearchParams(location.search).get("id");
    render();
  });
  load();
}
