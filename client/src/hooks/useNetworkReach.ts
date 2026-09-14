import { useEffect, useState } from "react";
import { fetchContactList, getFollowedPubkeys } from "@/services/socialActions";
import { fetchEventsByFilter } from "@/services/nostr";
import { CONTENT_RELAYS } from "@/lib/relays";
import type { NetworkReach } from "@/lib/clientFilters";

/**
 * How far the viewer's network reaches — the "Trust distance" behind the
 * reach filter. Direct follows are their own kind-3; friends of friends are a
 * sampled two-hop set built from those follows' contact lists (the same graph
 * the dashboard's reading feed uses). One fetch per viewer per session, held
 * in a module memo. Signed out there is no "you": empty and ready.
 */
const SAMPLE_FOLLOWS = 60;
const cache = new Map<string, Promise<NetworkReach>>();
const settled = new Map<string, NetworkReach>();
const EMPTY: NetworkReach = { direct: new Set(), friends: new Set(), ready: true };

async function build(pubkey: string): Promise<NetworkReach> {
  const direct = getFollowedPubkeys(await fetchContactList(pubkey).catch(() => null));
  const friends = new Set(direct);
  if (direct.size > 0) {
    const sample = Array.from(direct).slice(0, SAMPLE_FOLLOWS);
    const lists = await fetchEventsByFilter({ kinds: [3], authors: sample }, CONTENT_RELAYS, 8000).catch(() => []);
    for (const list of lists) {
      for (const pk of getFollowedPubkeys(list)) {
        if (pk !== pubkey) friends.add(pk);
      }
    }
  }
  return { direct, friends, ready: true };
}

function lookup(pubkey: string): Promise<NetworkReach> {
  let p = cache.get(pubkey);
  if (!p) {
    p = build(pubkey).then((r) => {
      settled.set(pubkey, r);
      return r;
    });
    cache.set(pubkey, p);
  }
  return p;
}

export function useNetworkReach(pubkey?: string | null): NetworkReach {
  const [, setVersion] = useState(0);
  useEffect(() => {
    if (!pubkey || settled.has(pubkey)) return;
    let alive = true;
    void lookup(pubkey).then(() => {
      if (alive) setVersion((v) => v + 1);
    });
    return () => {
      alive = false;
    };
  }, [pubkey]);
  if (!pubkey) return EMPTY;
  return settled.get(pubkey) ?? { direct: new Set(), friends: new Set(), ready: false };
}

/** Test seam. */
export function __resetNetworkReach(): void {
  cache.clear();
  settled.clear();
}
