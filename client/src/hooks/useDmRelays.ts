import { useMemo } from "react";
import type { NostrEvent } from "nostr-tools";
import { DM_RELAY_LIST_KIND, loadDmRelays, loadDmRelaysFor, parseDmRelays } from "@/lib/dm/inboxRelays";
import { useStoreEvents } from "@/hooks/useStoreEvents";
import { useStoreReplaceable } from "@/hooks/useStoreReplaceable";

/** Someone's inbox relays (kind 10050), live; `found` once their list is known. */
export function useDmRelays(pubkey: string | null | undefined) {
  const list = useStoreReplaceable(DM_RELAY_LIST_KIND, pubkey, () => loadDmRelays(pubkey!));
  const relays = useMemo(() => parseDmRelays(list.event), [list.event]);
  return { relays, found: !!list.event, loading: !!pubkey && !list.event && !list.settled };
}

/** The same for several people at once, asked together. */
export function useDmRelaysMany(pubkeys: string[]) {
  const key = pubkeys.join(",");
  const filters = useMemo(() => (pubkeys.length ? [{ kinds: [DM_RELAY_LIST_KIND], authors: pubkeys }] : null), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const lists = useStoreEvents(pubkeys.length ? `dm-inbox:${key}` : null, filters, () => loadDmRelaysFor(pubkeys));
  const byPubkey = useMemo(() => {
    const m = new Map<string, NostrEvent>();
    for (const e of lists.events) if (!m.has(e.pubkey)) m.set(e.pubkey, e);
    return m;
  }, [lists.events]);
  return {
    checking: pubkeys.length > 0 && !lists.settled,
    /** Settled, and no usable inbox relay. */
    blocked: lists.settled ? pubkeys.filter((pk) => !parseDmRelays(byPubkey.get(pk)).length) : [],
  };
}
