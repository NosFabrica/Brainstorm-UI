import { useMemo, useRef } from "react";
import { addrCoord, collectRefs, mentionPubkeysFromContent, type AddressRef, type MinimalEvent } from "@/lib/noteRefs";
import { MAX_REF_HINTS, PROFILE_RELAYS } from "@/lib/relays";
import { fetchAddressableEvents, fetchEventsByIds } from "@/services/nostr";
import { newerEvent, useHeldReplaceables } from "@/hooks/useHeldEvents";
import { useLiveProfiles } from "@/hooks/useLiveProfile";
import { useStoreEvents } from "@/hooks/useStoreEvents";

export type ProfileLite = { name?: string; display_name?: string; picture?: string; nip05?: string };

const NO_EVENTS: Map<string, MinimalEvent> = new Map();

/** Moved to lib/relays so services can cap hints too; kept here for its importers. */
export { MAX_REF_HINTS };

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
 *
 * `ready`: false while `events` are still streaming in. The quoted events and
 * articles are then shown from the store but not asked for, and are asked once,
 * together, when they settle (CODING_STANDARDS, "settled before dependents"),
 * not once per arriving note.
 */
export function useNoteRefs(
  events: MinimalEvent[],
  opts: { relays?: string[]; extraPubkeys?: string[]; ready?: boolean } = {},
): {
  profiles: Map<string, ProfileLite>;
  eventsById: Map<string, MinimalEvent>;
  addrByCoord: Map<string, MinimalEvent>;
} {
  const refs = useMemo(() => collectRefs(events), [events]);
  const relaysKey = (opts.relays ?? []).join(",");
  const relays = useMemo(
    () => Array.from(new Set([...(relaysKey ? relaysKey.split(",") : []), ...PROFILE_RELAYS])),
    [relaysKey],
  );

  const idsKey = [...refs.ids].sort().join(",");
  const idHintsKey = refs.idRelays.slice(0, MAX_REF_HINTS).join(",");
  const idFilters = useMemo(() => (idsKey ? [{ ids: idsKey.split(",") }] : null), [idsKey]);
  // Notes stream in, and each one changes the set: every reference is shown
  // from the store (the filter), but only the ones this mount hasn't asked
  // for yet are asked — the earlier notes' ask is still out, or done.
  const ready = opts.ready ?? true;
  const askedIds = useRef(new Set<string>());
  const quoted = useStoreEvents(ready && idsKey ? `note-refs:${idsKey}:${idHintsKey}` : null, idFilters, () => {
    const fresh = notYetAsked(askedIds.current, idsKey.split(","));
    return fresh.length
      ? fetchEventsByIds(fresh, Array.from(new Set([...relays, ...(idHintsKey ? idHintsKey.split(",") : [])])))
      : Promise.resolve(undefined);
  });
  const eventsById = useMemo(() => {
    if (!quoted.events.length) return NO_EVENTS;
    return new Map(quoted.events.map((ev) => [ev.id, ev as MinimalEvent]));
  }, [quoted.events]);

  // Keyed by coordinate AND hints: an identifier may hold a comma, so the
  // pointers themselves ride along in a memo rather than being re-parsed.
  const addrsKey = JSON.stringify(refs.addrs.map((a) => [addrCoord(a), a.relays ?? []]).sort());
  const addrs = useMemo<AddressRef[]>(
    () => capHints(refs.addrs),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [addrsKey],
  );
  const heldAddrs = useHeldReplaceables(addrs);
  // Held copies render through `heldAddrs`; this asks the relays for newer ones.
  const askedCoords = useRef(new Set<string>());
  const askedAddrs = useStoreEvents(ready && addrs.length ? `note-addrs:${addrsKey}` : null, null, async () => {
    const fresh = new Set(notYetAsked(askedCoords.current, addrs.map(addrCoord)));
    if (!fresh.size) return undefined;
    const asking = addrs.filter((a) => fresh.has(addrCoord(a)));
    return Array.from((await fetchAddressableEvents(asking, relays).catch(() => new Map())).values());
  });
  const fetchedAddrs = useMemo(() => {
    if (!askedAddrs.events.length) return NO_EVENTS;
    return new Map(
      (askedAddrs.events as MinimalEvent[]).map((e) => [
        `${e.kind}:${e.pubkey}:${e.tags.find((t) => t[0] === "d")?.[1] ?? ""}`,
        e,
      ]),
    );
  }, [askedAddrs.events]);
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

/** The keys not in `asked`, which are now marked asked. */
function notYetAsked(asked: Set<string>, keys: string[]): string[] {
  const fresh = keys.filter((k) => !asked.has(k));
  fresh.forEach((k) => asked.add(k));
  return fresh;
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
