import { escapeHtml } from "./escape-html.js";
import { userKey } from "./user-storage.js";

const FAILED_KEY = userKey("logbook_failed_writes");

// 401, 408 and 429 can succeed later; any other 4xx fails the same way on every retry.
export function isPermanentFailure(status) {
  return status >= 400 && status < 500 && ![401, 408, 429].includes(status);
}

export function getFailedWrites(storage = localStorage) {
  try {
    return JSON.parse(storage.getItem(FAILED_KEY)) ?? [];
  } catch {
    return [];
  }
}

export function addFailedWrite(item, reason, storage = localStorage) {
  storage.setItem(FAILED_KEY, JSON.stringify([...getFailedWrites(storage), { ...item, reason }]));
}

export function removeFailedWrite(qid, storage = localStorage) {
  storage.setItem(FAILED_KEY, JSON.stringify(getFailedWrites(storage).filter(item => item.qid !== qid)));
}

function describe(item) {
  if (item.kind === "location") return `the crag “${item.record.name}”`;
  if (item.kind === "place") return `the area “${item.record.area}”`;
  if (item.op === "delete") return `the deletion of “${item.record.name ?? "an entry"}”`;
  return `“${item.record.name}”`;
}

// Only an entry's add or edit can be fixed in the form; everything else can only be dropped.
export function createFailedWritesBanner({ el, onEdit, onDiscard }) {
  let items = [];

  el.addEventListener("click", e => {
    const button = e.target.closest("button[data-qid]");
    if (!button) return;
    const item = items.find(i => i.qid === button.dataset.qid);
    if (!item) return;
    if (button.dataset.action === "edit") onEdit(item);
    else onDiscard(item);
  });

  function render(next) {
    items = next;
    el.hidden = items.length === 0;
    el.innerHTML = items
      .map(item => {
        const editable = item.kind === "entry" && item.op !== "delete";
        return `<li class="flex flex-wrap items-center gap-2">
        <span class="grow">Couldn't save ${escapeHtml(describe(item))}: ${escapeHtml(item.reason)}</span>
        ${editable ? `<button type="button" class="btn" data-action="edit" data-qid="${escapeHtml(item.qid)}">Edit</button>` : ""}
        <button type="button" class="btn" data-action="discard" data-qid="${escapeHtml(item.qid)}">Discard</button>
      </li>`;
      })
      .join("");
  }

  return { render };
}
