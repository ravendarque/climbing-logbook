import { userKey } from "./user-storage.js";

// One cursor per table (a shared one could skip changes). A missing cursor just means a full delta.
const CURSORS_KEY = userKey("logbook_sync_cursors");

// Injectable: the Workers test pool has no localStorage.
function realStorage() {
  return typeof localStorage !== "undefined" ? localStorage : undefined;
}

function readAll(storage) {
  try {
    const parsed = JSON.parse(storage.getItem(CURSORS_KEY) || "{}");
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

export function getCursor(table, storage = realStorage()) {
  const cursor = readAll(storage)[table];
  return typeof cursor === "number" ? cursor : 0;
}

export function setCursor(table, value, storage = realStorage()) {
  const all = readAll(storage);
  all[table] = value;
  storage.setItem(CURSORS_KEY, JSON.stringify(all));
}
