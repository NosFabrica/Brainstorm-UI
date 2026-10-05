import { useMemo } from "react";
import { useStoreEvents } from "@/hooks/useStoreEvents";
import { useStoreReplaceable } from "@/hooks/useStoreReplaceable";
import { fetchContactList, getFollowedPubkeys } from "@/services/socialActions";
import { fetchEventsByAuthors } from "@/services/nostr";
import { CONTENT_RELAYS } from "@/lib/relays";
import type { NetworkReach } from "@/lib/clientFilters";

/**
 * How far the viewer's network reaches — the "Trust distance" behind the
 * reach filter. Direct follows are their own kind-3; friends of friends are a
 * sampled two-hop set built from those follows' contact lists (the same graph
 * the dashboard's reading feed uses), read from the store. Signed out there is
 * no "you": empty and ready.
 */
const SAMPLE_FOLLOWS = 60;
const EMPTY: NetworkReach = { direct: new Set(), friends: new Set(), ready: true };

export function useNetworkReach(pubkey?: string | null): NetworkReach {
  const contacts = useStoreReplaceable(3, pubkey, () => fetchContactList(pubkey!).catch(() => null));
  const direct = useMemo(() => getFollowedPubkeys((contacts.event as never) ?? null), [contacts.event]);
  const sample = useMemo(() => Array.from(direct).slice(0, SAMPLE_FOLLOWS), [direct]);
  const sampleKey = sample.join(",");
  const listsFilter = useMemo(() => [{ kinds: [3], authors: sample }], [sampleKey]); // eslint-disable-line react-hooks/exhaustive-deps
  // Routed: each of the sampled follows is asked for on the relays THEY write
  // to. A fixed content-relay set finds only the follows who happen to publish
  // there, which silently shrinks the two-hop set it is meant to build.
  const lists = useStoreEvents(
    pubkey && sample.length ? `network-reach:${sampleKey}` : null,
    sample.length ? listsFilter : null,
    () => fetchEventsByAuthors(sample, { kinds: [3] }, { fallback: CONTENT_RELAYS, timeoutMs: 8000 }).catch(() => []),
  );
  const ready = contacts.settled && (sample.length === 0 || lists.settled);
  const friends = useMemo(() => {
    const out = new Set(direct);
    if (!ready) return out;
    for (const list of lists.events) {
      for (const pk of getFollowedPubkeys(list as never)) if (pk !== pubkey) out.add(pk);
    }
    return out;
    // Built once the lists are in, not per arriving list.
  }, [ready, direct, pubkey]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!pubkey) return EMPTY;
  return ready ? { direct, friends, ready: true } : { direct: new Set(), friends: new Set(), ready: false };
}
