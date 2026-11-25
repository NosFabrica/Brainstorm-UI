/**
 * NIP-09 for the event a page shows: its author's deletion of it, asked for
 * when the page opens. The store holds a deletion it was handed (and drops
 * what it deletes), but a page that never asks shows a deleted note for as
 * long as no other screen happened to fetch the kind 5.
 */
import { useMemo } from "react";
import type { Filter } from "nostr-tools";
import { useStoreEvents } from "@/hooks/useStoreEvents";
import { CONTENT_RELAYS } from "@/lib/relays";
import { fetchEventsByAuthors } from "@/services/nostr";

type Deletable = { id: string; pubkey: string; kind: number; created_at: number; tags: string[][] };

/** An addressable event's address (NIP-01): what a deletion's `a` names. */
function addressOf(ev: Deletable): string | null {
  const addressable = ev.kind >= 30000 && ev.kind < 40000;
  const replaceable = ev.kind === 0 || ev.kind === 3 || (ev.kind >= 10000 && ev.kind < 20000);
  if (!addressable && !replaceable) return null;
  const d = addressable ? (ev.tags.find((t) => t[0] === "d")?.[1] ?? "") : "";
  return `${ev.kind}:${ev.pubkey}:${d}`;
}

/**
 * Whether the event's author has deleted it: a kind 5 by them naming its id,
 * or its address (which deletes every version up to the deletion's time).
 * Asked on the author's own relays (their outbox) and the page's hints.
 */
export function useEventDeleted(note: Deletable | null | undefined, relayHints: string[] = []): boolean {
  const id = note?.id;
  const author = note?.pubkey;
  const address = note ? addressOf(note) : null;
  const filters = useMemo<Filter[] | null>(
    () =>
      id && author
        ? [
            { kinds: [5], authors: [author], "#e": [id] },
            ...(address ? [{ kinds: [5], authors: [author], "#a": [address] }] : []),
          ]
        : null,
    [id, author, address],
  );
  // One ask per event: the hints only widen where it is looked for.
  const { events } = useStoreEvents(filters ? `deletion:${id}` : null, filters, async () => {
    const fallback = [...new Set([...relayHints, ...CONTENT_RELAYS])];
    const asks = filters!.map(({ authors: _authors, ...filter }) =>
      fetchEventsByAuthors([author!], filter, { fallback }),
    );
    return (await Promise.all(asks)).flat();
  });
  return useMemo(() => {
    if (!note) return false;
    return events.some(
      (del) =>
        del.kind === 5 &&
        del.pubkey === note.pubkey &&
        (del.tags.some((t) => t[0] === "e" && t[1] === note.id) ||
          (!!address && del.created_at >= note.created_at && del.tags.some((t) => t[0] === "a" && t[1] === address))),
    );
  }, [events, note, address]);
}
