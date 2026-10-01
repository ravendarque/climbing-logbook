// Null when there's no cache; aborting the upgrade stops the read from creating an empty database.
export function cachedEntries(page, username) {
  return page.evaluate(
    name =>
      new Promise((resolve, reject) => {
        const opening = indexedDB.open(name);
        opening.onupgradeneeded = () => opening.transaction.abort();
        opening.onerror = () => resolve(null);
        opening.onsuccess = () => {
          const db = opening.result;
          const tx = db.transaction(["rows", "meta"]);
          const rows = tx.objectStore("rows").getAll();
          const nextSeq = tx.objectStore("meta").get("nextSeq");
          tx.oncomplete = () => {
            db.close();
            resolve(
              nextSeq.result === undefined ? null : rows.result.sort((a, b) => a.seq - b.seq).map(({ row }) => row),
            );
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    `logbook_entries:${username.toLowerCase()}`,
  );
}

// A browser that won't keep site data in IndexedDB, as some privacy settings do.
export async function blockIndexedDb(page) {
  await page.addInitScript(() => {
    IDBFactory.prototype.open = () => {
      throw new DOMException("IndexedDB is blocked", "SecurityError");
    };
  });
}
