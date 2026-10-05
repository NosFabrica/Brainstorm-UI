import { useMemo } from "react";
import { fetchRecentByKinds } from "@/services/nostr";
import { isBlankEvent } from "@/lib/blankEvent";
import { useStoreEvents } from "@/hooks/useStoreEvents";

/**
 * A person's newest events of some kinds, live from the store, newest first —
 * `fetchRecentByKinds` fills it, batched with every other ask about the same
 * person in the same tick. Shown whole once the ask settles (held copies at once).
 * Husks deleted by overwriting are not content.
 */
export function useRecentByKinds(
  pubkey: string | null | undefined,
  kinds: number[],
  limit: number,
  relayHints: string[] = [],
) {
  const kindsKey = kinds.join(",");
  const filters = useMemo(
    () => (pubkey ? [{ kinds, authors: [pubkey], limit }] : null),
    [pubkey, kindsKey, limit], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const query = useStoreEvents(
    pubkey ? `recent:${pubkey}:${kindsKey}:${limit}` : null,
    filters,
    () => fetchRecentByKinds(pubkey!, kinds, limit, { relayHints }),
    // Pins, tags and quotes key on these: one list per ask, not one per arriving event.
    { minMs: 5 * 60_000, stream: false },
  );
  const events = useMemo(() => query.events.filter((e) => !isBlankEvent(e)).slice(0, limit), [query.events, limit]);
  return { ...query, events };
}
