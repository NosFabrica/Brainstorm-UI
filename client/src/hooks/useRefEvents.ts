/**
 * The events an activity names — a reaction's note, a deletion's targets, a
 * badge's definition, an RSVP's appointment — by id or by address, live from
 * the store (ADR 0005). One ask for the ids and one for the addresses, however
 * many there are; a held copy of an address draws at once and a newer one
 * replaces it. `settled` says the asks are back, so a page can tell "still
 * looking" from "not found".
 */
import { useMemo } from "react";
import { fetchAddressableEvents, fetchEventsByIds } from "@/services/nostr";
import { useHeldReplaceables } from "@/hooks/useHeldEvents";
import { useLiveProfiles } from "@/hooks/useLiveProfile";
import { MAX_REF_HINTS, capHints, mergeNewest } from "@/hooks/useNoteRefs";
import { useStoreEvents } from "@/hooks/useStoreEvents";
import type { EventRef } from "@/lib/activity";
import { PROFILE_RELAYS } from "@/lib/relays";
import { addrCoord, analyzeNote, parseATag, type AddressRef, type MinimalEvent } from "@/lib/noteRefs";

export type ProfileLite = { name?: string; display_name?: string; picture?: string; nip05?: string };

export interface RefEvents {
  /** By id, and by `kind:pubkey:d` for an address. */
  get: (ref: EventRef) => MinimalEvent | undefined;
  /** Authors of what came back, and the people they mention: a card names them, never shows a key. */
  profiles: Map<string, ProfileLite>;
  settled: boolean;
}

const NO_PEOPLE: string[] = [];

const byCoord = (events: MinimalEvent[]) =>
  new Map(events.map((e) => [`${e.kind}:${e.pubkey}:${e.tags.find((t) => t[0] === "d")?.[1] ?? ""}`, e]));

export function useRefEvents(refs: EventRef[]): RefEvents {
  // Keyed on the refs' values, never round-tripped through a joined string: an
  // address's `d` may hold any character, commas and bars included.
  const refsKey = JSON.stringify(refs.map((r) => [r.id ?? null, r.addr ?? null, r.relay ?? null]));
  const { ids, idKey, idRelays, addrs } = useMemo(() => {
    const ids = Array.from(new Set(refs.flatMap((r) => (r.id ? [r.id.toLowerCase()] : []))));
    // The relays the ids' own tags name, asked beside the default set.
    const hints = refs.flatMap((r) => (r.id && r.relay ? [r.relay] : [])).slice(0, MAX_REF_HINTS);
    const addrs = refs
      .map((r) => (r.addr ? parseATag(r.addr, r.relay) : null))
      .filter((a): a is AddressRef => a !== null);
    return {
      ids,
      idKey: ids.join(","),
      idRelays: Array.from(new Set([...hints, ...PROFILE_RELAYS])),
      addrs,
    };
    // `refsKey` is `refs`, as a value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refsKey]);

  const idFilters = useMemo(() => (ids.length ? [{ ids }] : null), [ids]);
  const byId = useStoreEvents(ids.length ? `activity-refs:${idKey}` : null, idFilters, () =>
    fetchEventsByIds(ids, idRelays),
  );
  const held = useHeldReplaceables(addrs);
  const byAddr = useStoreEvents(
    addrs.length ? `activity-addrs:${JSON.stringify(addrs.map(addrCoord))}` : null,
    null,
    async () => Array.from((await fetchAddressableEvents(capHints(addrs), PROFILE_RELAYS)).values()),
  );

  const found = useMemo(() => {
    const m = new Map<string, MinimalEvent>();
    for (const e of byId.events as MinimalEvent[]) m.set(e.id, e);
    for (const [coord, e] of mergeNewest(addrs, held, byCoord(byAddr.events as MinimalEvent[]))) m.set(coord, e);
    return m;
  }, [byId.events, addrs, held, byAddr.events]);

  const settled = (!ids.length || byId.settled) && (!addrs.length || byAddr.settled);
  // The profile ask waits for the events (CODING_STANDARDS: settled before
  // dependents): keyed on a set that grows as each one lands, it would re-ask per event.
  const people = useMemo(() => {
    if (!settled) return NO_PEOPLE;
    const set = new Set<string>();
    for (const e of found.values()) {
      set.add(e.pubkey);
      const refs = analyzeNote(e);
      refs.mentionPubkeys.forEach((pk) => set.add(pk));
    }
    return Array.from(set);
  }, [found, settled]);
  const profiles = useLiveProfiles(people) as Map<string, ProfileLite>;

  return useMemo(
    () => ({
      get: (ref: EventRef) => {
        if (ref.id) return found.get(ref.id.toLowerCase());
        const a = ref.addr ? parseATag(ref.addr) : null;
        return a ? found.get(addrCoord(a)) : undefined;
      },
      profiles,
      settled,
    }),
    [found, profiles, settled],
  );
}
