export const ENTRIES_DB_BASE = "logbook_entries";

const ROWS = "rows";
const META = "meta";
const NEXT_SEQ = "nextSeq";

function request(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function completion(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new DOMException("Transaction aborted", "AbortError"));
  });
}

async function write(db, work) {
  const tx = db.transaction([ROWS, META], "readwrite");
  const done = completion(tx);
  try {
    await work(tx.objectStore(ROWS), tx.objectStore(META));
  } catch {
    try {
      tx.abort();
    } catch {}
  }
  return done;
}

// Rows keep a sequence number so they load in the order a merge left them, not id order.
export async function openEntriesDb(name, factory = indexedDB) {
  const opening = factory.open(name, 1);
  opening.onupgradeneeded = () => {
    opening.result.createObjectStore(ROWS);
    opening.result.createObjectStore(META);
  };
  const db = await request(opening);
  db.onversionchange = () => db.close();

  return {
    async isCached() {
      const tx = db.transaction(META, "readonly");
      return (await request(tx.objectStore(META).get(NEXT_SEQ))) !== undefined;
    },

    async load() {
      const tx = db.transaction([ROWS, META], "readonly");
      const [stored, nextSeq] = await Promise.all([
        request(tx.objectStore(ROWS).getAll()),
        request(tx.objectStore(META).get(NEXT_SEQ)),
      ]);
      if (nextSeq === undefined) return null;
      return stored.sort((a, b) => a.seq - b.seq).map(({ row }) => row);
    },

    replace(rows) {
      return write(db, (store, meta) => {
        store.clear();
        for (const [seq, row] of rows.entries()) store.put({ seq, row }, row.id);
        meta.put(rows.length, NEXT_SEQ);
      });
    },

    apply(deltaRows) {
      return write(db, async (store, meta) => {
        let nextSeq = (await request(meta.get(NEXT_SEQ))) ?? 0;
        for (const { deleted, ...row } of deltaRows) {
          if (deleted) {
            store.delete(row.id);
            continue;
          }
          const existing = await request(store.get(row.id));
          store.put({ seq: existing?.seq ?? nextSeq++, row }, row.id);
        }
        meta.put(nextSeq, NEXT_SEQ);
      });
    },

    clear() {
      return write(db, (store, meta) => {
        store.clear();
        meta.clear();
      });
    },
  };
}
