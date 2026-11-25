/**
 * When the device key may go (lib/skVault `deleteDeviceKey`).
 *
 * It seals every Unlock cache and every kept private message on this browser,
 * for every account — so it can go only once no account anywhere on the device
 * needs it. Storage answers for Remembered Accounts. An account kept for one tab
 * only lives in that tab's sessionStorage, which no other tab can read: each tab
 * that holds an account says so by holding a shared Web Lock, and the key is
 * deleted only by a tab that gets the lock exclusively.
 *
 * Web Locks are secure-context only, and so is the vault: where there are no
 * locks there is no device key either, and nothing to delete.
 */
import { deleteDeviceKey } from "@/lib/skVault";

const NAME = "brainstorm:device-key";

type Locks = Pick<LockManager, "request">;

const browserLocks = (): Locks | undefined => (typeof navigator !== "undefined" ? navigator.locks : undefined);

let wanted = false;
let release: (() => void) | undefined;
let holding: Promise<unknown> | undefined;

/** Whether this tab holds an account, and so needs the device key kept. */
export function holdDeviceKey(needed: boolean, locks: Locks | undefined = browserLocks()): void {
  wanted = needed;
  if (!needed) {
    release?.();
    release = undefined;
    return;
  }
  if (holding || !locks?.request) return;
  holding = locks
    .request(NAME, { mode: "shared" }, () => (wanted ? new Promise<void>((resolve) => (release = resolve)) : undefined))
    .catch(() => undefined)
    .finally(() => {
      holding = undefined;
      // Wanted again while it was being let go.
      if (wanted) holdDeviceKey(true, locks);
    });
}

/**
 * Delete the device key if nothing needs it: `stillNeeded` says no for this tab
 * and its storage, and no other tab holds an account. Whether it was deleted.
 */
export async function dropDeviceKeyIfUnneeded(
  stillNeeded: () => boolean,
  { locks = browserLocks(), drop = deleteDeviceKey }: { locks?: Locks; drop?: () => Promise<void> } = {},
): Promise<boolean> {
  if (stillNeeded() || !locks?.request) return false;
  holdDeviceKey(false, locks);
  await holding;
  return (await locks.request(NAME, { mode: "exclusive", ifAvailable: true }, async (lock) => {
    if (!lock || stillNeeded()) return false;
    await drop();
    return true;
  })) as boolean;
}
