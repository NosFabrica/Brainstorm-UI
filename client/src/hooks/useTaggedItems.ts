import { useMemo } from "react";
import type { NostrEvent } from "nostr-tools";
import { useStoreEvents } from "@/hooks/useStoreEvents";
import { dlistCoordinateOf } from "@/lib/dlists";
import { headerNames, isDListItem } from "@/lib/dlistFields";
import { PROFILE_RELAYS } from "@/lib/relays";
import { coordinateOf } from "@/lib/tagTarget";
import { bLinksOf } from "@/lib/conceptResolution";
import { useListKinds } from "@/hooks/useListKinds";
import type { ListNames } from "@/lib/taggable";
import { fetchAddressableEvents, fetchEventsByIds } from "@/services/nostr";

const addressOfEvent = (e: NostrEvent) => `${e.kind}:${e.pubkey}:${e.tags.find((t) => t[0] === "d")?.[1] ?? ""}`;

/**
 * The things a set of taggings name, read so a page can say what each one is
 * (lib/taggable) and call it by its title: Your tags, where "a post" stood for
 * an issue, a repo and a video alike.
 *
 * A tagging names a post by id and an addressable thing (an article, a repo, a
 * list's item) by its coordinate (lib/tagTarget), so both are asked for, from
 * the EventStore and the relays (ADR 0005). A Dictionary list's item is called
 * what its list calls its items, so each item's list header is read too.
 *
 * `eventOf` and `listOf` are keyed by the target as the tagging wrote it.
 */
export function useTaggedItems(targets: string[]): {
  eventOf: (target: string) => NostrEvent | undefined;
  listOf: (target: string) => ListNames | null;
  loading: boolean;
} {
  const key = [...new Set(targets)].sort().join("\n");
  const { ids, coords } = useMemo(() => {
    const unique = key ? key.split("\n") : [];
    return {
      ids: unique.filter((t) => !coordinateOf(t)),
      coords: unique.flatMap((t) => coordinateOf(t) ?? []),
    };
  }, [key]);

  const idFilters = useMemo(() => (ids.length ? [{ ids }] : null), [ids]);
  const byId = useStoreEvents(ids.length ? `tagged-items:ids:${ids.join(",")}` : null, idFilters, () =>
    fetchEventsByIds(ids, PROFILE_RELAYS),
  );

  const coordFilters = useMemo(
    () => (coords.length ? coords.map((c) => ({ kinds: [c.kind], authors: [c.pubkey], "#d": [c.identifier] })) : null),
    [coords],
  );
  const byCoord = useStoreEvents(coords.length ? `tagged-items:coords:${key}` : null, coordFilters, async () =>
    Array.from((await fetchAddressableEvents(coords, PROFILE_RELAYS).catch(() => new Map())).values()),
  );

  // The newest version of each addressable thing, by its coordinate.
  const events = useMemo(() => {
    const out = new Map<string, NostrEvent>();
    for (const e of byId.events) out.set(e.id, e);
    for (const e of byCoord.events) {
      const address = addressOfEvent(e);
      const held = out.get(address);
      if (!held || e.created_at > held.created_at) out.set(address, e);
    }
    return out;
  }, [byId.events, byCoord.events]);

  const lists = useListNames(events);

  return {
    eventOf: (target) => events.get(target),
    listOf: (target) => {
      const item = events.get(target);
      return item ? lists.listOf(item) : null;
    },
    loading: byId.loading || byCoord.loading || lists.loading,
  };
}

/**
 * What each Dictionary list's item among these is called by its list
 * (`["names", "Book", "Books"]`), and the search filter made of that list
 * (hooks/useListKinds: Places, Books, GitHub accounts) when there is one: the
 * list headers are read from the EventStore and the relays, and `listOf`
 * answers for one item. Null for anything that is
 * not a list's item, or whose list couldn't be read.
 */
export function useListNames(events: ReadonlyMap<string, NostrEvent> | readonly NostrEvent[]): {
  listOf: (event: { kind: number; tags: string[][] }) => ListNames | null;
  loading: boolean;
} {
  const kinds = useListKinds();
  const all = useMemo(
    () => (Array.isArray(events) ? events : [...(events as ReadonlyMap<string, NostrEvent>).values()]),
    [events],
  );
  // Each list item's list, for what the list calls its items.
  const listCoords = useMemo(() => {
    const found = new Set<string>();
    for (const e of all) {
      const list = isDListItem(e) ? dlistCoordinateOf(e) : null;
      if (list && coordinateOf(list)) found.add(list);
    }
    return [...found].sort();
  }, [all]);
  const listKey = listCoords.join("\n");
  const listFilters = useMemo(
    () =>
      listCoords.length
        ? listCoords.map((c) => {
            const { kind, pubkey, identifier } = coordinateOf(c)!;
            return { kinds: [kind], authors: [pubkey], "#d": [identifier] };
          })
        : null,
    // `listKey` names the coordinates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [listKey],
  );
  const lists = useStoreEvents(listCoords.length ? `tagged-items:lists:${listKey}` : null, listFilters, async () =>
    Array.from(
      (
        await fetchAddressableEvents(
          listCoords.map((c) => coordinateOf(c)!),
          PROFILE_RELAYS,
        ).catch(() => new Map())
      ).values(),
    ),
  );
  const namesByList = useMemo(() => {
    const newest = new Map<string, NostrEvent>();
    for (const e of lists.events) {
      const address = addressOfEvent(e);
      const held = newest.get(address);
      if (!held || e.created_at > held.created_at) newest.set(address, e);
    }
    const out = new Map<string, ListNames>();
    for (const [address, header] of newest) {
      const { singular, plural } = headerNames(header);
      if (!singular) continue;
      // The search filter made of this list: the community's own list, or a copy pointing at it
      // (Places is "Food and Drink Places" and every copy of it).
      const family = new Set([address, ...bLinksOf(header).map((b) => b.target)]);
      const section = kinds.find((k) => family.has(k.community))?.label;
      out.set(address, section ? { singular, plural, section } : { singular, plural });
    }
    return out;
  }, [lists.events, kinds]);

  return {
    listOf: (event) => {
      const list = isDListItem(event) ? dlistCoordinateOf(event) : null;
      return (list && namesByList.get(list)) || null;
    },
    loading: lists.loading,
  };
}
