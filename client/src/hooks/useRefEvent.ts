/**
 * The one event a row or a quoted card points at — a highlight's article, a
 * reaction's note, a zap's post — store-first, and asked in the page's batch
 * (services/refBatch) for what the store lacks: a page of cards sends one ask
 * by id and one by address, not a REQ per card (ADR 0005).
 */
import { useMemo } from "react";
import { isNewerVersion } from "@/lib/newestPerAddress";
import type { NostrEvent } from "nostr-tools";
import { useStoreEvents } from "@/hooks/useStoreEvents";
import { eventStore } from "@/lib/eventStore";
import { HEX64, type ResultRef } from "@/lib/resultReaders";
import { coordOfAddr, fetchRefBatched } from "@/services/refBatch";

export interface RefEvent {
  event: NostrEvent | null;
  /** The ask is back (or nothing was asked): no event now means none was found. */
  settled: boolean;
}

export function useRefEvent(ref: ResultRef | null): RefEvent {
  const coord = ref?.addr ? coordOfAddr(ref.addr) : null;
  const id = !coord && ref?.id && HEX64.test(ref.id) ? ref.id.toLowerCase() : null;
  const coordKey = coord ? `${coord.kind}:${coord.pubkey}:${coord.identifier}` : null;
  const filters = useMemo(() => {
    const c = coordKey ? coordOfAddr(coordKey) : null;
    return c ? [{ kinds: [c.kind], authors: [c.pubkey], "#d": [c.identifier] }] : id ? [{ ids: [id] }] : null;
  }, [coordKey, id]);
  const held = coord
    ? !!eventStore.getReplaceable(coord.kind, coord.pubkey, coord.identifier)
    : !!(id && eventStore.getEvent(id));
  const key = held || !(coordKey || id) ? null : `ref-event:${coordKey ?? id}`;
  const found = useStoreEvents(key, filters, () => fetchRefBatched(ref!));
  const events = found.events as NostrEvent[];
  // An address can answer with several versions: the newest is the one.
  // NIP-01: the newest, and on a tie the lower id.
  const event = events.length ? events.reduce((a, b) => (isNewerVersion(b, a) ? b : a)) : null;
  return { event, settled: !!event || !key || found.settled };
}
