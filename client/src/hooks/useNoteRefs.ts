import { useEffect, useMemo, useState } from "react";
import { addrCoord, collectRefs, mentionPubkeysFromContent, type AddressRef, type MinimalEvent } from "@/lib/noteRefs";
import { PROFILE_RELAYS } from "@/lib/relays";
import { fetchAddressableEvents, fetchEventsByIds } from "@/services/nostr";
import { newerEvent, useHeldReplaceables } from "@/hooks/useHeldEvents";
import { useLiveProfiles } from "@/hooks/useLiveProfile";

export type ProfileLite = { name?: string; display_name?: string; picture?: string; nip05?: string };

const NO_EVENTS: Map<string, MinimalEvent> = new Map();

/**
 * How many of the notes' own relay hints join a read. A page of notes can name
 * dozens of relays between them; the ones it names first are asked, beside the
 * default set, rather than a socket for every one.
 */
export const MAX_REF_HINTS = 6;

/**
 * Everything a list of notes refers to, resolved once: the events they quote,
 * the articles they point at, and a profile for every person they mention,
 * reply to, or quote — the quoted notes' own mentions included. The fetchers
 * are store-first, so notes re-delivered by a stream cost nothing new, and
 * a late answer for a set of notes that has since changed is dropped.
 *
 * Articles and profiles are replaceable: a held copy renders at once, and a
 * newer one replaces it as it arrives (useHeldReplaceables). The relays a
 * reference names — an `nevent`'s or `naddr`'s hints, an `e`/`q`/`a` tag's —
 * are asked beside the default set.
 * The profile page and the search page render notes through the same cards;
 * this is the one recipe both feed them with (plain effects, like
 * useProfileMap — no query client needed wherever a note card renders).
 */
export function useNoteRefs(
  events: MinimalEvent[],
  opts: { relays?: string[]; extraPubkeys?: string[] } = {},
): { profiles: Map<string, ProfileLite>; eventsById: Map<string, MinimalEvent>; addrByCoord: Map<string, MinimalEvent> } {
  const refs = useMemo(() => collectRefs(events), [events]);
  const relaysKey = (opts.relays ?? []).join(",");
  const relays = useMemo(
    () => Array.from(new Set([...(relaysKey ? relaysKey.split(",") : []), ...PROFILE_RELAYS])),
    [relaysKey],
  );

  const idsKey = [...refs.ids].sort().join(",");
  const idHintsKey = refs.idRelays.slice(0, MAX_REF_HINTS).join(",");
  const [eventsById, setEventsById] = useState<Map<string, MinimalEvent>>(NO_EVENTS);
  useEffect(() => {
    if (!idsKey) {
      setEventsById(NO_EVENTS);
      return;
    }
    let alive = true;
    fetchEventsByIds(idsKey.split(","), Array.from(new Set([...relays, ...(idHintsKey ? idHintsKey.split(",") : [])])))
      .then((list) => {
        if (!alive) return;
        const m = new Map<string, MinimalEvent>();
        for (const ev of list as MinimalEvent[]) m.set(ev.id, ev);
        setEventsById(m);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [idsKey, idHintsKey, relays]);

  // Keyed by coordinate AND hints: an identifier may hold a comma, so the
  // pointers themselves ride along in a memo rather than being re-parsed.
  const addrsKey = JSON.stringify(refs.addrs.map((a) => [addrCoord(a), a.relays ?? []]).sort());
  const addrs = useMemo<AddressRef[]>(
    () => capHints(refs.addrs),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [addrsKey],
  );
  const heldAddrs = useHeldReplaceables(addrs);
  const [fetchedAddrs, setFetchedAddrs] = useState<Map<string, MinimalEvent>>(NO_EVENTS);
  useEffect(() => {
    if (!addrs.length) {
      setFetchedAddrs(NO_EVENTS);
      return;
    }
    let alive = true;
    fetchAddressableEvents(addrs, relays)
      .then((src) => {
        if (!alive) return;
        const m = new Map<string, MinimalEvent>();
        for (const [k, v] of src) m.set(k, v as MinimalEvent);
        setFetchedAddrs(m);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [addrs, relays]);
  const addrByCoord = useMemo(() => mergeNewest(addrs, heldAddrs, fetchedAddrs), [addrs, heldAddrs, fetchedAddrs]);

  const extraKey = (opts.extraPubkeys ?? []).join(",");
  const pubkeysKey = useMemo(() => {
    const set = new Set<string>(refs.pubkeys);
    for (const ev of eventsById.values()) {
      set.add(ev.pubkey);
      mentionPubkeysFromContent(ev.content).forEach((pk) => set.add(pk));
    }
    for (const ev of addrByCoord.values()) set.add(ev.pubkey);
    for (const pk of extraKey ? extraKey.split(",") : []) set.add(pk);
    return Array.from(set).sort().join(",");
  }, [refs.pubkeys, eventsById, addrByCoord, extraKey]);
  const pubkeys = useMemo(() => (pubkeysKey ? pubkeysKey.split(",") : []), [pubkeysKey]);
  const profiles = useLiveProfiles(pubkeys) as Map<string, ProfileLite>;

  return { profiles, eventsById, addrByCoord };
}

/**
 * The references' own relay hints, within one budget for the whole read:
 * `fetchAddressableEvents` unions every pointer's relays into one REQ, so a
 * per-pointer cap would still let twenty quoted articles open a hundred
 * sockets. The first MAX_REF_HINTS distinct relays named are kept.
 */
export function capHints(addrs: AddressRef[]): AddressRef[] {
  const allowed = new Set(Array.from(new Set(addrs.flatMap((a) => a.relays ?? []))).slice(0, MAX_REF_HINTS));
  return addrs.map((a) => (a.relays?.length ? { ...a, relays: a.relays.filter((relay) => allowed.has(relay)) } : a));
}

/** Per coordinate, the newer of the held copy and the fetched one. */
export function mergeNewest(
  addrs: AddressRef[],
  held: Map<string, MinimalEvent>,
  fetched: Map<string, MinimalEvent>,
): Map<string, MinimalEvent> {
  if (!held.size && !fetched.size) return NO_EVENTS;
  const out = new Map<string, MinimalEvent>();
  for (const a of addrs) {
    const key = addrCoord(a);
    const ev = newerEvent(held.get(key), fetched.get(key));
    if (ev) out.set(key, ev);
  }
  return out;
}
