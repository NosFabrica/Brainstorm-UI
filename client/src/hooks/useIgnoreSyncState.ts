import { useSyncExternalStore } from "react";
import { getIgnoreSyncState, onIgnoreSyncChange, type IgnoreSyncState } from "@/lib/networkAlertsIgnored";

/**
 * Subscribe to whether the ignore list is reaching the user's account.
 *
 * Exists as a hook so `networkAlertsIgnored` can stay framework-free — it's
 * imported by plain modules as well as components, and pulling React into it
 * just to notify the UI would be the wrong dependency direction.
 *
 * "local-only" means the NIP-78 copy could not be written and retrying won't
 * help, so surfaces that describe the list ("saved to your account") must stop
 * claiming that.
 */
export function useIgnoreSyncState(): IgnoreSyncState {
  return useSyncExternalStore(onIgnoreSyncChange, getIgnoreSyncState, () => "ok" as const);
}
