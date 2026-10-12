import { useEffect, useMemo, useState } from "react";
import type { NostrEvent } from "nostr-tools";
import { dictionaryRelays } from "@/config/dictionary";
import { useDictionaryReader } from "@/hooks/useDictionaryReader";
import { useStoreEvents } from "@/hooks/useStoreEvents";
import {
  B_DEFERRED,
  pointsAt,
  resolveConcept,
  type DefinitionSource,
  type HeaderEvent,
  type ResolvedConcept,
} from "@/lib/conceptResolution";
import { coordinateOf } from "@/lib/dlistFields";
import { copyBy, houseCopyAuthors } from "@/services/dictionary";
import { readListEvents } from "@/services/listReads";

export interface ListDefinition {
  source: DefinitionSource;
  /** Resolved with this definition governing, so a renderer draws by it and says whose it is. */
  resolved: ResolvedConcept;
}

/** Most local first, as resolution ranks them (lib/conceptResolution). */
const PRECEDENCE: DefinitionSource[] = ["personal", "assistant", "house", "community"];

/**
 * Every definition of a list a reader could see its items by: the list's own
 * header, and the copies of it by the reader, their Assistant and Brainstorm
 * (the house and its Assistant) — each resolved as if it governed, for an item
 * form to preview under. `governing` is the one that does govern for this
 * reader. Copies are read from the hub and our index into the EventStore.
 */
export function useListDefinitions(header: NostrEvent) {
  const coordinate = coordinateOf(header) ?? "";
  const { pubkey, taPubkey } = useDictionaryReader();
  const [house, setHouse] = useState<string[] | null>(null);
  useEffect(() => {
    let alive = true;
    void houseCopyAuthors()
      .catch(() => [])
      .then((authors) => alive && setHouse(authors));
    return () => {
      alive = false;
    };
  }, []);
  const authors = [...new Set([pubkey, taPubkey, ...(house ?? [])].filter((a): a is string => !!a))].sort();
  const authorsKey = authors.join(",");
  const filters = useMemo(
    () => (authors.length ? [{ kinds: [39998], authors, "#b": [coordinate] }] : null),
    // `authorsKey` is `authors`, as a value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [authorsKey, coordinate],
  );
  const read = useStoreEvents(
    filters ? `list-copies:${coordinate}:${authorsKey}` : null,
    filters,
    () => readListEvents(filters ?? [], 8000, dictionaryRelays()),
    { minMs: 60_000 },
  );

  return useMemo(() => {
    const community = header as HeaderEvent;
    const copies = (read.events as HeaderEvent[]).filter(
      (h) => pointsAt(h, coordinate) && !h.tags.some((t) => t[0] === "b" && t[1] === B_DEFERRED),
    );
    const as = (slot: Exclude<DefinitionSource, "community">, copy: HeaderEvent | null): ListDefinition[] =>
      copy
        ? [{ source: slot, resolved: resolveConcept({ community, communityCoordinate: coordinate, [slot]: copy })! }]
        : [];
    const houseCopy = (house ?? []).map((a) => copyBy(a, coordinate, copies)).find(Boolean) ?? null;
    const definitions: ListDefinition[] = [
      { source: "community", resolved: resolveConcept({ community, communityCoordinate: coordinate })! },
      ...as("house", houseCopy),
      ...as("assistant", taPubkey ? copyBy(taPubkey, coordinate, copies) : null),
      ...as("personal", pubkey && pubkey !== header.pubkey ? copyBy(pubkey, coordinate, copies) : null),
    ];
    const governing = PRECEDENCE.find((s) => definitions.some((d) => d.source === s)) ?? "community";
    return { definitions, governing, settled: read.settled && house !== null };
  }, [header, coordinate, read.events, read.settled, house, pubkey, taPubkey]);
}
