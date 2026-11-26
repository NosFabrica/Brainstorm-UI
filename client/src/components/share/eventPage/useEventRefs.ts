import { useMemo } from "react";
import { useStoreEvents } from "@/hooks/useStoreEvents";
import { fetchEventsByIds, fetchAddressableEvents } from "@/services/nostr";
import { useHeldReplaceables } from "@/hooks/useHeldEvents";
import { useLiveProfiles } from "@/hooks/useLiveProfile";
import { MAX_REF_HINTS, capHints, mergeNewest } from "@/hooks/useNoteRefs";
import { PROFILE_RELAYS } from "@/lib/relays";
import { collectRefs, addrCoord, type MinimalEvent } from "@/lib/noteRefs";

type ProfileLite = { display_name?: string; name?: string; picture?: string; nip05?: string; website?: string };

const byCoord = (events: MinimalEvent[]) =>
  new Map(events.map((e) => [`${e.kind}:${e.pubkey}:${e.tags.find((t) => t[0] === "d")?.[1] ?? ""}`, e]));

/**
 * References inside the note (quoted notes, articles, mentions) so the rich
 * card can embed them — same two batched queries the share page uses. Only a
 * page that draws the note's words asks (`note` null otherwise): every other
 * hero asks for what it names itself, a fold at a time (a bookmark set's items,
 * a follow set's or a Trusted People list's thousands of members, an activity's post).
 *
 * `profiles` holds every person the refs name, and the author's own profile.
 */
export function useEventRefs(
  note: MinimalEvent | null,
  relayHints: string[],
  author: { pubkey: string; profile: unknown },
) {
  const refs = useMemo(() => collectRefs(note ? [note] : []), [note]);
  const refEventsQuery = useStoreEvents(
    refs.ids.length ? `event-refs:${refs.ids.join(",")}` : null,
    refs.ids.length ? [{ ids: refs.ids }] : null,
    () =>
      fetchEventsByIds(
        refs.ids,
        Array.from(new Set([...relayHints, ...PROFILE_RELAYS, ...refs.idRelays.slice(0, MAX_REF_HINTS)])),
      ),
  );
  // The held copies render through `heldAddrs` below; this only fills the store.
  const addrEventsQuery = useStoreEvents(
    refs.addrs.length ? `event-addrs:${refs.addrs.map(addrCoord).join(",")}` : null,
    null,
    async () =>
      Array.from(
        (
          await fetchAddressableEvents(capHints(refs.addrs), Array.from(new Set([...relayHints, ...PROFILE_RELAYS])))
        ).values(),
      ),
  );

  const eventsById = useMemo(() => {
    const m = new Map<string, MinimalEvent>();
    for (const ev of (refEventsQuery.events ?? []) as MinimalEvent[]) m.set(ev.id, ev);
    return m;
  }, [refEventsQuery.events]);
  // Referenced articles: the held copy at once, the newer of it and the
  // fetched one after — and any later version the store receives.
  const heldAddrs = useHeldReplaceables(refs.addrs);
  const addrByCoord = useMemo(
    () => mergeNewest(refs.addrs, heldAddrs, byCoord(addrEventsQuery.events as MinimalEvent[])),
    [refs.addrs, heldAddrs, addrEventsQuery.events],
  );

  const allRefPubkeys = useMemo(() => {
    const set = new Set<string>(refs.pubkeys);
    for (const ev of eventsById.values()) set.add(ev.pubkey);
    for (const ev of addrByCoord.values()) set.add(ev.pubkey);
    return Array.from(set);
  }, [refs.pubkeys, eventsById, addrByCoord]);
  const refProfiles = useLiveProfiles(allRefPubkeys);

  const { pubkey: authorPk, profile: authorProfile } = author;
  const profiles = useMemo(() => {
    const m = new Map<string, ProfileLite>(refProfiles as Map<string, ProfileLite>);
    if (authorPk && authorProfile) m.set(authorPk, authorProfile as ProfileLite);
    return m;
  }, [refProfiles, authorPk, authorProfile]);

  return { eventsById, addrByCoord, profiles };
}
