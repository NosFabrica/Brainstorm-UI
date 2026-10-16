import { useMemo } from "react";
import type { NostrEvent } from "nostr-tools";
import { dictionaryRelays } from "@/config/dictionary";
import { useStoreEvents } from "@/hooks/useStoreEvents";
import { B_DEFERRED } from "@/lib/conceptResolution";
import { parseCoordinate } from "@/lib/dlistFields";
import type { ListRef } from "@/lib/listRef";
import { newestPerAddress } from "@/lib/newestPerAddress";
import { readListEvents } from "@/services/listReads";

/** Asked again at most every minute: List Management is where lists change. */
const WINDOW = { minMs: 60_000 };
const READ_MS = 8000;

/** A list header that's still a list: not one withdrawn as a copy (`b-tag-deferred`). */
const isLiveList = (ev: NostrEvent) =>
  (ev.kind === 39998 || ev.kind === 9998) && !ev.tags.some((t) => t[0] === "b" && t[1] === B_DEFERRED);

/**
 * The lists someone has published — their kind-39998 headers, read from the
 * tag hub and our index into the EventStore (ADR 0005), newest first. A copy
 * they withdrew isn't one.
 */
export function useMyLists(pubkey: string | null) {
  const filters = useMemo(() => (pubkey ? [{ kinds: [39998], authors: [pubkey] }] : null), [pubkey]);
  const read = useStoreEvents(
    pubkey ? `my-lists:${pubkey}` : null,
    filters,
    () => readListEvents(filters ?? [], READ_MS, dictionaryRelays()),
    WINDOW,
  );
  const lists = useMemo(() => newestPerAddress(read.events).filter(isLiveList), [read.events]);
  return { lists, settled: read.settled };
}

/**
 * One list by what was pasted (lib/listRef): the newest header at its
 * address, or the version an id names. Read from the reference's relay hints
 * as well as the hub and our index.
 */
export function useListAt(ref: ListRef | null) {
  const target = ref ? (ref.type === "address" ? ref.coordinate : ref.id) : null;
  const filters = useMemo(() => {
    if (!ref) return null;
    if (ref.type === "id") return [{ ids: [ref.id] }];
    const c = parseCoordinate(ref.coordinate)!;
    return [{ kinds: [c.kind], authors: [c.pubkey], "#d": [c.d] }];
    // `target` is the reference, as a value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);
  const read = useStoreEvents(
    target ? `list-at:${target}` : null,
    filters,
    () => readListEvents(filters ?? [], READ_MS, [...new Set([...(ref?.relays ?? []), ...dictionaryRelays()])]),
    WINDOW,
  );
  const header = useMemo(() => newestPerAddress(read.events).find(isLiveList) ?? null, [read.events]);
  return { header, settled: read.settled };
}
