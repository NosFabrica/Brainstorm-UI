/**
 * What the signed-in account reads of itself, fetched together at sign-in (and on a
 * reload): its profile (kind 0), its AI keys (kind 12000) and its Blossom servers
 * (kind 10063), in one REQ to its own relays rather than three asks made one by one as
 * pages mount. Every copy lands in the store as a relay sends it (docs/adr/0005).
 *
 * The asks this stands in for are claimed under their own keys (`lib/askOnce`), so a
 * header or page mounting while it is out joins it instead of sending its own: the
 * profile's (`useLiveProfile`) and the AI keys' (`useAgentKeys`). The Blossom list has no
 * such ask — `loadBlossomServers` answers from the store, which this fills.
 *
 * What may be kept on the device is `lib/eventCache`'s call, not this module's: the
 * profile and the Blossom list are; kind 12000 is not — it is encrypted to self, and a
 * shared browser's storage is no place for one account's ciphertext.
 */
import { askOnce, claim, isDue, replaceableAskKey, track, type AskWindow } from "@/lib/askOnce";
import { AGENT_KEYS_KIND } from "@/lib/agentKeys";
import { BLOSSOM_SERVER_LIST_KIND } from "@/lib/blossomServers";
import { PROFILE_ASK_WINDOW, profileAskKey } from "@/lib/profileAsk";
import { PROFILE_RELAYS } from "@/lib/relays";
import { requestAll } from "@/lib/relayRequest";
import { outboxRelays } from "@/lib/relayRouting";

/** `useStoreReplaceable`'s default window, which the AI keys' hook asks under. */
const STORE_ASK_WINDOW: AskWindow = { minMs: 5 * 60_000 };

const WARMUP_TIMEOUT_MS = 6_000;

/** Fetch the account's own profile, AI keys and Blossom servers in one ask. */
export function warmOwnAccount(pubkey: string): Promise<unknown> | undefined {
  if (!/^[0-9a-f]{64}$/i.test(pubkey)) return undefined;
  const profileKey = profileAskKey(pubkey);
  const keysKey = replaceableAskKey(AGENT_KEYS_KIND, pubkey);
  const ask = askOnce(`own-account:${pubkey}`, STORE_ASK_WINDOW, async () => {
    // From the hydrated relay list, so no relay round trip before the REQ.
    const relays = await outboxRelays(pubkey, PROFILE_RELAYS, { timeoutMs: 2_500 }).catch(() => PROFILE_RELAYS);
    return requestAll(
      relays,
      { kinds: [0, AGENT_KEYS_KIND, BLOSSOM_SERVER_LIST_KIND], authors: [pubkey] },
      WARMUP_TIMEOUT_MS,
    );
  });
  if (!ask) return undefined;
  // Claimed only when due: an ask already made for either stands, and isn't doubled.
  if (isDue(profileKey)) {
    claim(profileKey, PROFILE_ASK_WINDOW);
    track([profileKey], ask);
  }
  if (isDue(keysKey)) {
    claim(keysKey, STORE_ASK_WINDOW);
    track([keysKey], ask);
  }
  return ask;
}
