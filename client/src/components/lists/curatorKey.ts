/**
 * A curator's key as List Management shows it where there is no profile name
 * to show: an npub, or, for a pubkey that isn't a key, the pubkey as it came.
 * An index event the store did not verify can carry anything as its author,
 * and encoding that would throw in the middle of a render; here it never
 * does. For ListItems and ItemInspector.
 */
import { nip19 } from "nostr-tools";

const HEX_KEY = /^[0-9a-f]{64}$/;

/** The npub of `pubkey`, or the pubkey itself when it can't be encoded; "" for one that is missing. */
export function curatorKey(pubkey: string): string {
  // An index event can carry any value as its author, so a pubkey is text only once it is made so.
  const key = String(pubkey ?? "");
  if (!HEX_KEY.test(key)) return key;
  try {
    return nip19.npubEncode(key);
  } catch {
    return key;
  }
}

/** Its first 12 characters, to tell one curator from another at a glance. */
export const shortCuratorKey = (pubkey: string) => `${curatorKey(pubkey).slice(0, 12)}…`;
