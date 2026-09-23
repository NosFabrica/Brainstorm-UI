/**
 * The little of IndexedDB this app needs, as promises. Transactions resolve on
 * `oncomplete` — an IndexedDB request succeeds before its transaction commits,
 * so resolving on the request would report a write that a full quota then
 * aborts.
 */

export function openDb(
  name: string,
  /** Omit to adopt whatever version exists, rather than demanding a number. */
  version: number | undefined,
  upgrade: (db: IDBDatabase) => void,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, version);
    req.onupgradeneeded = () => upgrade(req.result);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("indexeddb blocked"));
  });
}

/**
 * Run `work` in one transaction and settle when it commits. `work` must issue
 * its requests synchronously — awaiting inside a transaction ends it.
 */
export function transact<T>(
  db: IDBDatabase,
  store: string,
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore, keep: (value: T) => void) => void,
): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    let held: T | undefined;
    const tx = db.transaction(store, mode);
    tx.oncomplete = () => resolve(held);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("transaction aborted"));
    work(tx.objectStore(store), (value) => {
      held = value;
    });
  });
}
