import { useCallback, useMemo, useState } from "react";
import type { NostrEvent } from "nostr-tools";
import type { Filter } from "applesauce-core/helpers/filter";
import { dictionaryRelays } from "@/config/dictionary";
import { useStoreEvents } from "@/hooks/useStoreEvents";
import { headerReference } from "@/lib/dlistFields";
import { INSPECT_LIMIT, INSPECT_TIMEOUT_MS, filedItems, itemFilters } from "@/services/dictionary";
import { readListEvents } from "@/services/listReads";

/** Asked again at most every minute: List Management is where lists change. */
const WINDOW = { minMs: 60_000, stream: false };

/**
 * Every item filed under a list — the newest version of each, newest first —
 * read from the tag hub and our index into the EventStore (ADR 0005), up to
 * the relay's cap. `truncated` says the read reached it, so more may exist;
 * `reload` asks again, past the window.
 */
export function useListItems(header: NostrEvent) {
  const ref = headerReference(header);
  const [n, setN] = useState(0);
  const filters = useMemo(() => (ref ? (itemFilters([ref]) as Filter[]) : null), [ref]);
  const read = useStoreEvents(
    ref ? `list-items:${ref}:${n}` : null,
    filters,
    () => readListEvents(itemFilters([ref!], INSPECT_LIMIT), INSPECT_TIMEOUT_MS, dictionaryRelays()),
    WINDOW,
  );
  const items = useMemo(() => (ref ? filedItems(read.events, [ref]) : []), [read.events, ref]);
  const reload = useCallback(() => setN((i) => i + 1), []);
  // A header with no reference has nothing to ask, so it is settled at once.
  return { items, truncated: read.events.length >= INSPECT_LIMIT, settled: !ref || read.settled, reload };
}
