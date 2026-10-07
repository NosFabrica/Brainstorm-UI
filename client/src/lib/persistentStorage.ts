/**
 * Ask the browser not to evict this origin's storage — the signed-in account,
 * the sealed message cache, the profile cache (IndexedDB) — when the device
 * runs short of space. Without it, a cleared store reads as being signed out
 * with an empty inbox.
 *
 * Only in an installed app, where Chrome grants it without a prompt and it is
 * plainly wanted; a browser tab (Firefox prompts for it) is left alone.
 */
import { isInstalledApp } from "./installedApp";

let asked = false;

export function keepStorageForInstalledApp(): void {
  if (asked || typeof navigator === "undefined" || !isInstalledApp()) return;
  const storage = navigator.storage as StorageManager | undefined;
  if (!storage?.persist) return;
  asked = true;
  void storage
    .persisted()
    .then((already) => already || storage.persist())
    .catch(() => {});
}

/** Test seam. */
export function __resetPersistentStorage(): void {
  asked = false;
}
