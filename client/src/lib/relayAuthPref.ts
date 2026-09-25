/**
 * Whether this account signs in to relays that ask (NIP-42), on this device.
 * Off until the reader turns it on: answering a relay's challenge means a
 * signing prompt per relay in nos2x or Amber until "always allow" is ticked,
 * and an unasked-for prompt is not a setting anyone chose.
 */
import { Subject } from "rxjs";
import { accountKey } from "@/lib/accountStorage";

const changed = new Subject<string>();

/** Emits the pubkey whose choice just changed, so services/relayAuth can act on it without a reload. */
export const relayAuthChanged$ = changed.asObservable();

export function relayAuthAllowed(pubkey: string): boolean {
  try {
    return localStorage.getItem(accountKey("brainstorm_relay_auth", pubkey)) === "1";
  } catch {
    return false;
  }
}

export function setRelayAuthAllowed(pubkey: string, on: boolean): void {
  try {
    const key = accountKey("brainstorm_relay_auth", pubkey);
    if (on) localStorage.setItem(key, "1");
    else localStorage.removeItem(key);
  } catch {
    /* private window, full quota — the default stands */
  }
  changed.next(pubkey);
}
