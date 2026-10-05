import { useMemo } from "react";
import type { NostrEvent } from "nostr-tools";
import type { AskWindow } from "@/lib/askOnce";
import { useStoreEvents } from "@/hooks/useStoreEvents";

/**
 * One replaceable event — a contact list, a relay list, an app-data blob — live
 * from the store while `ask` fills it. The store keeps only the newest version,
 * so a stale relay copy never displaces our own later publish.
 *
 * `settled` is the ask having finished: "has none" needs it, an empty store alone
 * is only "not known yet".
 */
export function useStoreReplaceable(
  kind: number,
  pubkey: string | null | undefined,
  ask: () => Promise<unknown>,
  { identifier, window }: { identifier?: string; window?: AskWindow } = {},
): { event: NostrEvent | undefined; loading: boolean; settled: boolean } {
  const filters = useMemo(
    () =>
      pubkey
        ? [{ kinds: [kind], authors: [pubkey], ...(identifier !== undefined ? { "#d": [identifier] } : {}) }]
        : null,
    [kind, pubkey, identifier],
  );
  const query = useStoreEvents(
    pubkey ? `replaceable:${kind}:${pubkey}:${identifier ?? ""}` : null,
    filters,
    ask,
    window,
  );
  return { event: query.events[0], loading: query.loading, settled: query.settled };
}
