import { useCallback, useMemo, useReducer } from "react";
import type { NostrEvent } from "nostr-tools";
import { dictionaryRelays } from "@/config/dictionary";
import { useStoreEvents } from "@/hooks/useStoreEvents";
import { forget } from "@/lib/askOnce";
import { headerReference } from "@/lib/dlistFields";
import { INSPECT_LIMIT, INSPECT_TIMEOUT_MS, filedItems, itemFilters } from "@/services/dictionary";
import { readListEvents } from "@/services/listReads";

/** Asked again at most every minute: List Management is where lists change. */
const WINDOW = { minMs: 60_000, stream: false };

/** Slack under the deadline: relay timers and the clock are read in one tick, so a read cut off at 20 s can measure 19,999 ms. */
const DEADLINE_SLACK_MS = 500;

/**
 * Per list, how many times it has been read again: the ask key's last part.
 * Kept beside the asks (lib/askOnce) and not in a component, so a mount after
 * a Read again asks under the latest key, never one already asked.
 */
const generation = new Map<string, number>();

/** What a read measured of its own answer: whether it ran to its deadline, and whether it reached the cap. */
interface ReadFlags {
  key: string;
  cutOff: boolean;
  truncated: boolean;
}

/**
 * Per list, the latest read to settle. Kept beside the asks too: a mount
 * within the window is served the earlier answer without the read running
 * again, and must still know. One per list, so reading again replaces it.
 */
const lastRead = new Map<string, ReadFlags>();

const ask = (ref: string, n: number) => `list-items:${ref}:${n}`;

/**
 * Every item filed under a list — the newest version of each, newest first —
 * read from the tag hub and our index into the EventStore (ADR 0005), up to
 * the relay's cap. `also` names more headers whose items count as the list's:
 * a version of it, say. `truncated` says the read's answer reached the cap, so
 * more may exist; `cutOff` says the read ran to its deadline, so a relay may
 * not have finished answering; `reload` asks again, past the window.
 */
export function useListItems(header: NostrEvent, also: readonly string[] = []) {
  const own = headerReference(header);
  const alsoKey = also.join(" ");
  /** The headers the items are filed under, or none: a header with no reference has no items to ask for. */
  const filedUnder = useMemo(
    () => (own ? [...new Set([own, ...also])] : []),
    // `alsoKey` is `also`, as a value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [own, alsoKey],
  );
  /** What the reads of this list are kept by: every header it reads, as one value. */
  const ref = filedUnder.length ? filedUnder.join(" ") : null;
  const [, rerender] = useReducer((i: number) => i + 1, 0);
  const key = ref ? ask(ref, generation.get(ref) ?? 0) : null;
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
      if (key && ref) {
        lastRead.set(ref, {
          key,
          // The deadline cuts both relays off at once, so a read that took all of it may have lost part of an answer.
          cutOff: Date.now() - asked >= INSPECT_TIMEOUT_MS - DEADLINE_SLACK_MS,
          // Measured on the answer, not the store: events kept from earlier reads are not this read reaching the cap.
          // Index and hub answers arrive merged, so this errs toward saying more may exist (loadListItems).
          truncated: events.length >= INSPECT_LIMIT,
        });
      }
      return events;
    },
    WINDOW,
  );
  const items = useMemo(() => filedItems(read.events, filedUnder), [read.events, filedUnder]);
  // Reading again keeps the earlier rows on screen, so until it settles they keep the earlier read's flags.
  const last = ref ? lastRead.get(ref) : undefined;
  const flags = last && (last.key === key || !read.settled) ? last : undefined;
  const reload = useCallback(() => {
    if (!ref) return;
    const n = generation.get(ref) ?? 0;
    // That key is never asked again, so its answer is let go rather than kept for the page's life.
    forget(ask(ref, n));
    generation.set(ref, n + 1);
    rerender();
  }, [ref]);
  return {
    items,
    truncated: flags?.truncated ?? false,
    cutOff: flags?.cutOff ?? false,
    // A header with no reference has nothing to ask, so it is settled at once.
    settled: !ref || read.settled,
    reload,
  };
}
