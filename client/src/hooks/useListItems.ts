import { useCallback, useMemo, useState } from "react";
import type { NostrEvent } from "nostr-tools";
import { dictionaryRelays } from "@/config/dictionary";
import { useStoreEvents } from "@/hooks/useStoreEvents";
import { headerReference } from "@/lib/dlistFields";
import { INSPECT_LIMIT, INSPECT_TIMEOUT_MS, filedItems, itemFilters } from "@/services/dictionary";
import { readListEvents } from "@/services/listReads";

/** Asked again at most every minute: List Management is where lists change. */
const WINDOW = { minMs: 60_000, stream: false };

/**
 * Per ask key, whether its last read ran to its deadline. Kept beside the asks
 * (lib/askOnce) and not in a component: a mount within the window is served
 * the earlier answer without the read running again, and must still know.
 */
const ranToDeadline = new Map<string, boolean>();

/**
 * Every item filed under a list — the newest version of each, newest first —
 * read from the tag hub and our index into the EventStore (ADR 0005), up to
 * the relay's cap. `truncated` says the read reached it, so more may exist;
 * `cutOff` says the read ran to its deadline, so a relay may not have finished
 * answering; `reload` asks again, past the window.
 */
export function useListItems(header: NostrEvent) {
  const ref = headerReference(header);
  /** The one header the items are filed under, or none: a header with no reference has no items to ask for. */
  const filedUnder = useMemo(() => (ref ? [ref] : []), [ref]);
  const [n, setN] = useState(0);
  const key = ref ? `list-items:${ref}:${n}` : null;
  const filters = useMemo(() => (filedUnder.length ? itemFilters(filedUnder) : null), [filedUnder]);
  const read = useStoreEvents(
    key,
    filters,
    async () => {
      const asked = Date.now();
      const events = await readListEvents(
        itemFilters(filedUnder, INSPECT_LIMIT),
        INSPECT_TIMEOUT_MS,
        dictionaryRelays(),
      );
      // The deadline cuts both relays off at once, so a read that took all of it may have lost part of an answer.
      if (key) ranToDeadline.set(key, Date.now() - asked >= INSPECT_TIMEOUT_MS);
      return events;
    },
    WINDOW,
  );
  const items = useMemo(() => filedItems(read.events, filedUnder), [read.events, filedUnder]);
  const reload = useCallback(() => setN((i) => i + 1), []);
  return {
    items,
    truncated: read.events.length >= INSPECT_LIMIT,
    cutOff: key !== null && ranToDeadline.get(key) === true,
    // A header with no reference has nothing to ask, so it is settled at once.
    settled: !ref || read.settled,
    reload,
  };
}
