import { useSyncExternalStore } from "react";
import { accountManager } from "@/accounts";

/**
 * A per-account device setting (useScoreDisplayMode, useTierGranularity) held
 * once for every component that reads it.
 *
 * These are read by every coin, ring and tier word on a page, hundreds on a
 * results page. Read per instance, each did a localStorage read on mount and
 * kept its own pair of window listeners. Here the window listeners (the
 * same-tab custom event, the cross-tab `storage` event) are one pair, added
 * with the first reader and dropped with the last, and the active Account is
 * watched so a switch re-reads the setting under the new account's key.
 *
 * While nobody is mounted the value isn't trusted to be current (storage may
 * have changed with nobody listening), so it is read afresh, once per task:
 * the first render of a page with a hundred readers reads it once.
 */
export interface DeviceSetting<T> {
  /** The current value, for useSyncExternalStore. */
  snapshot: () => T;
  subscribe: (listener: () => void) => () => void;
}

export function deviceSetting<T>({
  read,
  storageKey,
  eventName,
}: {
  /** Reads the value for the active account, defaulted. */
  read: () => T;
  /** The localStorage key the active account's value lives under. */
  storageKey: () => string;
  /** The same-tab event the setter fires. */
  eventName: string;
}): DeviceSetting<T> {
  // Read on first use, not at import: the active account may not be restored yet.
  let value = undefined as T;
  let readThisTask = false;
  const listeners = new Set<() => void>();

  const refresh = () => {
    const next = read();
    if (Object.is(next, value)) return;
    value = next;
    for (const l of [...listeners]) l();
  };
  const onStorage = (e: StorageEvent) => {
    if (e.key === storageKey()) refresh();
  };
  let unwatchAccount: (() => void) | null = null;

  return {
    snapshot() {
      if (listeners.size === 0 && !readThisTask) {
        value = read();
        readThisTask = true;
        queueMicrotask(() => (readThisTask = false));
      }
      return value;
    },
    subscribe(listener) {
      if (listeners.size === 0) {
        window.addEventListener(eventName, refresh);
        window.addEventListener("storage", onStorage);
        const sub = accountManager.active$.subscribe(() => refresh());
        unwatchAccount = () => sub.unsubscribe();
      }
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (listeners.size > 0) return;
        window.removeEventListener(eventName, refresh);
        window.removeEventListener("storage", onStorage);
        unwatchAccount?.();
        unwatchAccount = null;
      };
    },
  };
}

/** The setting's value, re-rendering when it changes. */
export function useDeviceSetting<T>(setting: DeviceSetting<T>): T {
  return useSyncExternalStore(setting.subscribe, setting.snapshot, setting.snapshot);
}
