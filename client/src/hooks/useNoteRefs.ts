import { useEffect, useMemo, useState } from "react";
import { collectRefs, mentionPubkeysFromContent, type MinimalEvent } from "@/lib/noteRefs";
import { PROFILE_RELAYS } from "@/lib/relays";
import { fetchAddressableEvents, fetchEventsByIds, fetchProfileMap } from "@/services/nostr";

export type ProfileLite = { name?: string; display_name?: string; picture?: string; nip05?: string };

const NO_EVENTS: Map<string, MinimalEvent> = new Map();
const NO_PROFILES: Map<string, ProfileLite> = new Map();

/**
 * Everything a list of notes refers to, resolved once: the events they quote,
 * the articles they point at, and a profile for every person they mention,
 * reply to, or quote — the quoted notes' own mentions included. The fetchers
 * are store-first, so notes re-delivered by a stream cost nothing new, and
 * a late answer for a set of notes that has since changed is dropped.
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
  const [eventsById, setEventsById] = useState<Map<string, MinimalEvent>>(NO_EVENTS);
  useEffect(() => {
    if (!idsKey) {
      setEventsById(NO_EVENTS);
      return;
    }
    let alive = true;
    fetchEventsByIds(idsKey.split(","), relays)
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
  }, [idsKey, relays]);

  const coordsKey = refs.addrs.map((a) => `${a.kind}:${a.pubkey}:${a.identifier}`).sort().join(",");
  const [addrByCoord, setAddrByCoord] = useState<Map<string, MinimalEvent>>(NO_EVENTS);
  useEffect(() => {
    if (!coordsKey) {
      setAddrByCoord(NO_EVENTS);
      return;
    }
    let alive = true;
    const addrs = coordsKey.split(",").map((c) => {
      const [kind, pubkey, ...rest] = c.split(":");
      return { kind: Number(kind), pubkey, identifier: rest.join(":") };
    });
    fetchAddressableEvents(addrs, relays)
      .then((src) => {
        if (!alive) return;
        const m = new Map<string, MinimalEvent>();
        for (const [k, v] of src) m.set(k, v as MinimalEvent);
        setAddrByCoord(m);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [coordsKey, relays]);

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
  const [profiles, setProfiles] = useState<Map<string, ProfileLite>>(NO_PROFILES);
  useEffect(() => {
    if (!pubkeysKey) {
      setProfiles(NO_PROFILES);
      return;
    }
    let alive = true;
    fetchProfileMap(pubkeysKey.split(","))
      .then((map) => {
        if (alive) setProfiles(map as Map<string, ProfileLite>);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [pubkeysKey]);

  return { profiles, eventsById, addrByCoord };
}
