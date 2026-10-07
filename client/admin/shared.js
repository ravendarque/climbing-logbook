export const SAVE_ERROR = "Couldn't save that. Check your connection and try again.";

function parseDate(value) {
  // D1's datetime('now') has no zone; Better Auth's timestamps are ISO.
  return new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
}

export function formatDate(value, { withYear = false, withTime = true } = {}) {
  return parseDate(value).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export async function api(path, init) {
  const res = await fetch(`/-/api/admin/${path}`, init);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.status === 204 ? null : res.json();
}

export function cardClass(selected) {
  return `flex flex-col gap-1.5 p-3 bg-surface border rounded-app no-underline text-foreground hover:border-accent ${
    selected ? "border-accent" : "border-border"
  }`;
}

export function addField(list, label, value) {
  const dd = el("dd", "m-0 break-words");
  if (value instanceof Node) dd.append(value);
  else dd.textContent = value;
  list.append(el("dt", "text-muted", label), dd);
}

// A plain click stays on the page; a modified one opens the link as the browser would.
export function onPlainClick(container, selector, handler) {
  container.addEventListener("click", e => {
    const link = e.target.closest(selector);
    if (!link || e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    handler(link);
  });
}

export async function refreshCounts() {
  try {
    const counts = await api("counts");
    for (const name of ["reports", "feedback"]) {
      document.querySelector(`#tab-${name} [data-unread]`).textContent = counts[name] ? String(counts[name]) : "";
    }
  } catch {}
}
