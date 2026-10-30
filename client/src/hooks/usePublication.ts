/**
 * NKBIP-01 publications, read from the EventStore (docs/adr/0005): the
 * entries an index lists, and the book a section belongs to.
 */
import { useMemo, useRef } from "react";
import type { NostrEvent } from "nostr-tools";
import { fetchAddressableEvents, fetchEventsByIds, fetchIndexesListing } from "@/services/nostr";
import { fetchRefBatched } from "@/services/refBatch";
import { coordKey, newerEvent, useHeldReplaceables } from "@/hooks/useHeldEvents";
import { useStoreEvents } from "@/hooks/useStoreEvents";
import { PROFILE_RELAYS } from "@/lib/relays";
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

/**
 * Past this many entries an index is asked on its own, in chunks: the page's
 * batch would put a whole book's `#d` list in one filter, past what a relay
 * answers in one go. Below it, entries join the page's batch, so the parts of
 * a book drawn together share one ask instead of one per part per relay.
 */
const CHUNK = 100;

const chunks = <T>(items: T[]): T[][] =>
  Array.from({ length: Math.ceil(items.length / CHUNK) }, (_, i) => items.slice(i * CHUNK, (i + 1) * CHUNK));

const NO_REFS: SectionRef[] = [];

/** The entries a list of refs asks for: by address, by id, and the relays each is asked at. */
async function askEntries(refs: SectionRef[], relays: string[]): Promise<NostrEvent[]> {
  if (refs.length <= CHUNK) {
    const found = await Promise.all(
      refs.map((ref) =>
        fetchRefBatched({
          addr: ref.address ? ref.key : undefined,
          id: ref.address ? undefined : ref.eventId,
          relay: ref.relay ?? ref.address?.relays?.[0] ?? relays[0],
        }).catch(() => [] as NostrEvent[]),
      ),
    );
    return found.flat();
  }
  const addresses = refs.flatMap((r) =>
    r.address ? [{ ...r.address, relays: [...(r.address.relays ?? []), ...relays] }] : [],
  );
  const ids = refs.flatMap((r) => (!r.address && r.eventId ? [r.eventId] : []));
  const hints = refs.flatMap((r) => (r.relay ? [r.relay] : []));
  const [byAddress, byId] = await Promise.all([
    Promise.all(
      chunks(addresses).map((part) => fetchAddressableEvents(part).catch(() => new Map<string, NostrEvent>())),
    ),
    // Hints beside the default relays, never instead of them.
    ids.length
      ? fetchEventsByIds(ids, [...new Set([...hints, ...relays, ...PROFILE_RELAYS])]).catch(() => [] as NostrEvent[])
      : [],
  ]);
  return [...byAddress.flatMap((m) => [...m.values()]), ...byId];
}

/**
 * Every entry of an index's table of contents, in order, each with its event
 * once it arrives. Held copies show at once; the rest are asked in one go —
 * with every other index drawn in the same moment (services/refBatch), not
 * one REQ per row or per part. `settled` once that ask has answered: an entry
 * still missing then is missing. `null` asks for nothing.
 *
 * An entry keeps its identity while its event does, so a memoized row
 * re-renders when its own section lands, not whenever any section does.
 */
export function usePublicationEntries(
  index: { id: string; tags: string[][] } | null,
  relays: string[] = [],
): { entries: PublicationEntry[]; settled: boolean } {
  const refs = useMemo(() => (index ? publicationSections(index) : NO_REFS), [index]);
  const addresses = useMemo(() => refs.flatMap((r) => (r.address ? [r.address] : [])), [refs]);
  const ids = useMemo(() => refs.flatMap((r) => (!r.address && r.eventId ? [r.eventId] : [])), [refs]);
  const held = useHeldReplaceables(addresses);
  const relaysKey = relays.join(",");
  const asked = useStoreEvents(
    index && refs.length ? `publication:${index.id}:${relaysKey}` : null,
    ids.length ? [{ ids }] : null,
    () => askEntries(refs, relays),
  );

  const previous = useRef(new Map<string, PublicationEntry>());
  const entries = useMemo(() => {
    const fetched = new Map<string, NostrEvent>();
    for (const e of asked.events) {
      if (e.kind >= 30000 && e.kind < 40000) {
        const key = coordinateOf(e);
        fetched.set(key, newerEvent(fetched.get(key), e)!);
      }
      fetched.set(e.id, e);
    }
    const kept = new Map<string, PublicationEntry>();
    const list = refs.map((ref) => {
      const event = ref.address
        ? newerEvent(held.get(coordKey(ref.address)), fetched.get(ref.key))
        : ref.eventId
          ? fetched.get(ref.eventId)
          : undefined;
      const before = previous.current.get(ref.key);
      const entry = before && before.ref === ref && before.event === event ? before : { ref, event };
      kept.set(ref.key, entry);
      return entry;
    });
    previous.current = kept;
    return list;
  }, [refs, held, asked.events]);

  return { entries, settled: asked.settled || !refs.length };
}

/**
 * The events behind a few refs (a section's neighbours), asked in the page's
 * batch: their titles for the pager, and the next page already in the store.
 */
export function usePrefetchedRefs(refs: SectionRef[], relays: string[] = []): Map<string, NostrEvent> {
  const addresses = useMemo(() => refs.flatMap((r) => (r.address ? [r.address] : [])), [refs]);
  const held = useHeldReplaceables(addresses);
  const key = refs.map((r) => r.key).join(",");
  const asked = useStoreEvents(key ? `publication-refs:${key}` : null, null, () => askEntries(refs, relays));
  return useMemo(() => {
    const out = new Map<string, NostrEvent>();
    for (const ref of refs) {
      const event = ref.address
        ? newerEvent(
            held.get(coordKey(ref.address)),
            asked.events.find((e) => coordinateOf(e) === ref.key),
          )
        : asked.events.find((e) => e.id === ref.eventId);
      if (event) out.set(ref.key, event);
    }
    return out;
  }, [refs, held, asked.events]);
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
  const asked = useStoreEvents(ev ? `publication-parent:${coordinate}` : null, listing, () =>
    named
      ? fetchRefBatched({ addr: coordKey(named), relay: relays[0] })
      : fetchIndexesListing(coordinate, ev!.pubkey, relays),
  );

  return useMemo(() => {
    if (!ev) return undefined;
    if (named) {
      const fetched = asked.events.find((e) => coordinateOf(e) === coordKey(named));
      return newerEvent(held.get(coordKey(named)), fetched);
    }
    // Only an index that still lists it: a newer version may have dropped it.
    const listing = asked.events.filter(
      (e) => e.kind === PUBLICATION_INDEX_KIND && e.tags.some((t) => t[0] === "a" && t[1]?.trim() === coordinate),
    );
    const own = listing.filter((e) => e.pubkey === ev.pubkey);
    return (own.length ? own : listing).sort((a, b) => b.created_at - a.created_at)[0];
  }, [ev, named, held, asked.events, coordinate]);
}
