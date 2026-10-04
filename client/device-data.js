import { ENTRIES_DB_BASE } from "./entries-db.js";
import { getFailedWrites } from "./failed-writes.js";
import { readPendingQueue } from "./delta-pull.js";
import { userKey } from "./user-storage.js";

const DELETE_TIMEOUT_MS = 5000;

export function unsyncedChangeCount(storage = localStorage) {
  return readPendingQueue(userKey("logbook_pending_queue")).length + getFailedWrites(storage).length;
}

function deleteDatabase(factory, name) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Deleting ${name} is blocked`)), DELETE_TIMEOUT_MS);
    const request = factory.deleteDatabase(name);
    request.onsuccess = () => {
      clearTimeout(timer);
      resolve();
    };
    request.onerror = () => {
      clearTimeout(timer);
      reject(request.error);
    };
  });
}

// Per-user keys are all `base:username` (user-storage.js); device-level choices such as the theme have no suffix.
function removeUserKeys(storage, owner) {
  const suffix = `:${owner}`;
  for (const key of Object.keys(storage)) {
    if (key.endsWith(suffix)) storage.removeItem(key);
  }
}

// True only if everything went.
export async function removeDeviceData(username, { storage = localStorage, factory = globalThis.indexedDB } = {}) {
  const owner = username.toLowerCase();
  let removedAll = true;
  try {
    removeUserKeys(storage, owner);
  } catch {
    removedAll = false;
  }
  if (factory) {
    try {
      await deleteDatabase(factory, `${ENTRIES_DB_BASE}:${owner}`);
    } catch {
      removedAll = false;
    }
  }
  return removedAll;
}
