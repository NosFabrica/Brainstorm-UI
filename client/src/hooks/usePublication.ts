/**
 * NKBIP-01 publications, read from the EventStore (docs/adr/0005): the
 * entries an index lists, and the book a section belongs to.
 */
import { useMemo, useRef } from "react";
import type { NostrEvent } from "nostr-tools";
import { fetchIndexesListing } from "@/services/nostr";
import { fetchRefBatched } from "@/services/refBatch";
import { coordKey, newerEvent, useHeldReplaceables } from "@/hooks/useHeldEvents";
import { useStoreEvents } from "@/hooks/useStoreEvents";
import { isAddressableKind } from "applesauce-core/helpers";
import {
  BOOKSHELF_KIND,
  coordinateOf,
  entryTitle,
  identifierOf,
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

const NO_REFS: SectionRef[] = [];

/**
 * How many relays an index's own hints may add to an ask. A hint is the
 * publisher's to write, and a book of a thousand entries each naming its own
 * relay would have every reader open a thousand sockets — each one learning
 * who is reading. The page's own hints count first.
 */
const MAX_HINTS = 4;

const hintOf = (ref: SectionRef): string | undefined => ref.relay ?? ref.address?.relays?.[0];

/**
 * The entries a list of refs asks for, in the page's batch (services/refBatch,
 * which splits what it gathers into relay-sized asks): the parts of a book
 * drawn together share one ask instead of one per part per relay.
 */
async function askEntries(refs: SectionRef[], relays: string[]): Promise<NostrEvent[]> {
  const allowed = new Set<string>();
  for (const hint of [...relays, ...refs.map(hintOf)]) if (hint && allowed.size < MAX_HINTS) allowed.add(hint);
  const found = await Promise.all(
    refs.map((ref) => {
      const hint = hintOf(ref);
      return fetchRefBatched({
        addr: ref.address ? ref.key : undefined,
        id: ref.address ? undefined : ref.eventId,
        relay: hint && allowed.has(hint) ? hint : relays[0],
      }).catch(() => [] as NostrEvent[]);
    }),
  );
  return found.flat();
}

/**
 * Every entry of an index's table of contents, in order, each with its event
 * once it arrives. Held copies show at once; the rest are asked in one go —
 * with every other index drawn in the same moment (services/refBatch), not
 * one REQ per row or per part. `settled` once that ask has answered: an entry
 * still missing then is missing. `null` asks for nothing.
 *
 * An entry keeps its identity while its event does, so a memoized row's own
 * props stay the same until its section lands; the list around it still
 * re-renders, cheaply, once per arrival.
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
      if (isAddressableKind(e.kind)) {
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
 * The index a section or a part belongs to — or, for a shelf, the shelf it
 * sits on. A section that names its book (`T`) is answered by address; any
 * other by who lists it: its own author's indexes that name its coordinate.
 * Only its own author's: anyone can publish a book listing anyone's chapter,
 * and a stranger's would put their title over the chapter and their
 * neighbours beside it.
 */
export function usePublicationParent(
  ev: { id: string; kind: number; pubkey: string; tags: string[][] } | null,
  relays: string[] = [],
): NostrEvent | undefined {
  const named: SectionAddress | null = useMemo(() => (ev ? sectionBookAddress(ev) : null), [ev]);
  const namedList = useMemo(() => (named ? [named] : []), [named]);
  const held = useHeldReplaceables(namedList);
  const coordinate = ev ? coordinateOf(ev) : "";
  // A shelf sits on shelves; a book's part or section, in a book.
  const parentKind = ev?.kind === BOOKSHELF_KIND ? BOOKSHELF_KIND : PUBLICATION_INDEX_KIND;
  const listing = useMemo(
    () => (ev && !named ? [{ kinds: [parentKind], "#a": [coordinate] }] : null),
    [ev, named, coordinate, parentKind],
  );
  const asked = useStoreEvents(ev ? `publication-parent:${coordinate}` : null, listing, () =>
    named
      ? fetchRefBatched({ addr: coordKey(named), relay: relays[0] })
      : fetchIndexesListing(coordinate, ev!.pubkey, relays, parentKind),
  );

  return useMemo(() => {
    if (!ev) return undefined;
    if (named) {
      const fetched = asked.events.find((e) => coordinateOf(e) === coordKey(named));
      return newerEvent(held.get(coordKey(named)), fetched);
    }
    // Only an index that still lists it: a newer version may have dropped it.
    return asked.events
      .filter(
        (e) =>
          e.kind === parentKind &&
          e.pubkey === ev.pubkey &&
          e.tags.some((t) => t[0] === "a" && t[1]?.trim() === coordinate),
      )
      .sort((a, b) => b.created_at - a.created_at)[0];
  }, [ev, named, held, asked.events, coordinate, parentKind]);
}

/** How many coordinates a book's comment thread asks about: a REQ's `#a` list, not a whole library. */
const SCOPE_CAP = 300;

/**
 * A book's parts and sections, as coordinates with their names: where its
 * comments are. Readers comment on the chapter they are reading, so a book's
 * thread holds those too. Taken from the book's own contents and the parts it
 * holds, once those have answered — a scope that grew per arriving part would
 * be a REQ per part (CODING_STANDARDS: settled before dependents).
 */
export function useBookScope(
  index: { id: string; kind: number; tags: string[][] } | null,
  relays: string[] = [],
): ReadonlyMap<string, string> | undefined {
  const book = index?.kind === PUBLICATION_INDEX_KIND ? index : null;
  const { entries, settled } = usePublicationEntries(book, relays);
  // A part's own entries, named live: the section events land after the parts do.
  const inner = useMemo(
    () =>
      entries.flatMap(({ event }) =>
        event?.kind === PUBLICATION_INDEX_KIND
          ? publicationSections(event).map((ref) => ({ ref, partD: identifierOf(event) }))
          : [],
      ),
    [entries],
  );
  const innerAddresses = useMemo(() => inner.flatMap(({ ref }) => (ref.address ? [ref.address] : [])), [inner]);
  const held = useHeldReplaceables(innerAddresses);
  return useMemo(() => {
    if (!book || !settled) return undefined;
    const scope = new Map<string, string>();
    const add = (ref: SectionRef, event: NostrEvent | undefined, parentD: string) => {
      if (ref.address && scope.size < SCOPE_CAP) scope.set(ref.key, entryTitle(ref, event, parentD));
    };
    for (const { ref, event } of entries) add(ref, event, identifierOf(book));
    for (const { ref, partD } of inner) add(ref, ref.address ? held.get(coordKey(ref.address)) : undefined, partD);
    return scope;
  }, [book, entries, inner, held, settled]);
}
