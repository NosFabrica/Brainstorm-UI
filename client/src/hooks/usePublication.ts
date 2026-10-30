/**
 * NKBIP-01 publications, read from the EventStore (docs/adr/0005): the
 * entries an index lists, and the book a section belongs to.
 */
import { useMemo } from "react";
import type { NostrEvent } from "nostr-tools";
import { fetchAddressableEvents, fetchEventsByIds, fetchIndexesListing } from "@/services/nostr";
import { coordKey, newerEvent, useHeldReplaceables } from "@/hooks/useHeldEvents";
import { useStoreEvents } from "@/hooks/useStoreEvents";
import {
  coordinateOf,
  publicationSections,
  PUBLICATION_INDEX_KIND,
  sectionBookAddress,
  type SectionAddress,
  type SectionRef,
} from "@/lib/publication";

export interface PublicationEntry {
  ref: SectionRef;
  /** The section, once the store holds it. */
  event?: NostrEvent;
}

/** Coordinates per ask: a `#d` list a relay will take, and an answer under its result cap. */
const CHUNK = 100;

const chunks = <T>(items: T[]): T[][] =>
  Array.from({ length: Math.ceil(items.length / CHUNK) }, (_, i) => items.slice(i * CHUNK, (i + 1) * CHUNK));

/**
 * Every entry of an index's table of contents, in order, each with its event
 * once it arrives. Held copies show at once; the rest are asked in one go per
 * index — a whole book's chapters, not one REQ per row. `settled` once that
 * ask has answered: an entry still missing then is missing.
 */
export function usePublicationEntries(
  index: { id: string; tags: string[][] },
  relays: string[] = [],
): { entries: PublicationEntry[]; settled: boolean } {
  const refs = useMemo(() => publicationSections(index), [index]);
  const addresses = useMemo(() => refs.flatMap((r) => (r.address ? [r.address] : [])), [refs]);
  const ids = useMemo(() => refs.flatMap((r) => (!r.address && r.eventId ? [r.eventId] : [])), [refs]);
  const held = useHeldReplaceables(addresses);
  const relaysKey = relays.join(",");
  const asked = useStoreEvents(
    refs.length ? `publication:${index.id}:${relaysKey}` : null,
    ids.length ? [{ ids }] : null,
    async () => {
      const [byAddress, byId] = await Promise.all([
        Promise.all(
          chunks(addresses).map((part) =>
            fetchAddressableEvents(part.map((a) => ({ ...a, relays: [...(a.relays ?? []), ...relays] }))).catch(
              () => new Map<string, NostrEvent>(),
            ),
          ),
        ),
        ids.length ? fetchEventsByIds(ids, relays.length ? relays : undefined).catch(() => []) : [],
      ]);
      return [...byAddress.flatMap((m) => [...m.values()]), ...byId];
    },
  );

  const entries = useMemo(() => {
    const fetched = new Map<string, NostrEvent>();
    for (const e of asked.events) {
      const key = e.kind >= 30000 && e.kind < 40000 ? coordinateOf(e) : e.id;
      fetched.set(key, newerEvent(fetched.get(key), e)!);
      fetched.set(e.id, e);
    }
    return refs.map((ref) => {
      const event = ref.address
        ? newerEvent(held.get(coordKey(ref.address)), fetched.get(ref.key))
        : ref.eventId
          ? fetched.get(ref.eventId)
          : undefined;
      return { ref, event };
    });
  }, [refs, held, asked.events]);

  return { entries, settled: asked.settled || !refs.length };
}

/**
 * The index a section or a part belongs to. A section that names its book
 * (`T`) is answered by address; any other is answered by who lists it: the
 * indexes whose contents name its coordinate, its own author's first.
 */
export function usePublicationParent(
  ev: { id: string; kind: number; pubkey: string; tags: string[][]; content: string } | null,
  relays: string[] = [],
): NostrEvent | undefined {
  const named: SectionAddress | null = useMemo(() => (ev ? sectionBookAddress(ev) : null), [ev]);
  const namedList = useMemo(() => (named ? [named] : []), [named]);
  const held = useHeldReplaceables(namedList);
  const coordinate = ev ? coordinateOf(ev) : "";
  const listing = useMemo(
    () => (ev && !named ? [{ kinds: [PUBLICATION_INDEX_KIND], "#a": [coordinate] }] : null),
    [ev, named, coordinate],
  );
  const asked = useStoreEvents(ev ? `publication-parent:${coordinate}` : null, listing, async () =>
    named
      ? [...(await fetchAddressableEvents([{ ...named, relays }]).catch(() => new Map())).values()]
      : fetchIndexesListing(coordinate, ev!.pubkey),
  );

  return useMemo(() => {
    if (!ev) return undefined;
    if (named) {
      const fetched = asked.events.find((e) => coordinateOf(e) === coordKey(named));
      return newerEvent(held.get(coordKey(named)), fetched);
    }
    // Only an index that still lists it: a newer version may have dropped it.
    const listing = asked.events.filter(
      (e) => e.kind === PUBLICATION_INDEX_KIND && e.tags.some((t) => t[0] === "a" && t[1] === coordinate),
    );
    const own = listing.filter((e) => e.pubkey === ev.pubkey);
    return (own.length ? own : listing).sort((a, b) => b.created_at - a.created_at)[0];
  }, [ev, named, held, asked.events, coordinate]);
}
