import { api, el, formatDate } from "./shared.js";

const ACTIONS = {
  suspend: "Suspended",
  unsuspend: "Unsuspended",
  delete: "Deleted",
  ban: "Banned",
  hide: "Hid a climb of",
  unhide: "Unhid a climb of",
};

export async function startActivity() {
  const status = document.getElementById("activity-status");
  const list = document.getElementById("activity-list");
  status.textContent = "Loading…";
  try {
    const { entries } = await api("audit");
    list.replaceChildren(
      ...entries.map(entry => {
        const item = el("li", "flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-3 border-b border-border");
        const what = el("span", "text-sm");
        what.append(`${ACTIONS[entry.action] ?? entry.action} `, el("strong", "break-all", entry.username));
        if (entry.detail) what.append(`: ${entry.detail}`);
        item.append(
          what,
          el("span", "text-sm text-muted break-all", entry.email),
          el("span", "ml-auto text-xs text-muted", formatDate(entry.createdAt, { withYear: true })),
        );
        return item;
      }),
    );
    status.textContent = entries.length ? "" : "Nothing yet. Suspending, deleting and banning are recorded here.";
  } catch {
    status.textContent = "Couldn't load these. Check your connection and reload.";
  }
}
