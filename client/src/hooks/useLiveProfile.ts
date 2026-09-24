import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { NostrEvent } from "nostr-tools";
import type { ProfileContent } from "applesauce-core/helpers/profile";
import { fetchProfileMap, refreshProfileEvent } from "@/services/nostr";
import { profileContentOf } from "@/lib/profileContent";
import { eventStore } from "@/lib/eventStore";
import { newerEvent, useHeldReplaceable, useHeldReplaceables } from "@/hooks/useHeldEvents";

/**
 * The subject of a profile page: whatever copy of their kind-0 the device
 * holds, at once and however old, while the relays — the `nprofile`'s hints
 * among them — are asked for a newer one, which replaces it as it lands.
 *
 * `loading` is true only while nothing at all is known: a held copy is never
 * hidden behind a spinner.
 */
export function useLiveProfile(
  pubkey: string | undefined,
  relayHints: string[] = [],
): { event: NostrEvent | undefined; profile: ProfileContent | undefined; loading: boolean } {
  const held = useHeldReplaceable(0, pubkey || undefined);
  const hintsKey = relayHints.join(",");
  const query = useQuery({
    queryKey: ["live-profile", pubkey, hintsKey],
    queryFn: () => refreshProfileEvent(pubkey!, { relayHints }),
    enabled: !!pubkey,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const event = newerEvent(query.data ?? undefined, held);
  const profile = useMemo(() => profileContentOf(event), [event]);
  return { event, profile, loading: !event && query.isLoading };
}

const NO_PROFILES: Map<string, ProfileContent> = new Map();

/** How long one ask for a person's profile covers every list that shows them. */
const ASKED_FOR_MS = 5 * 60_000;
const askedAt = new Map<string, number>();

/**
 * The people in this list not already asked for in the last few minutes.
 * A results page mounts dozens of lists over largely the same people; one ask
 * is enough, because what it finds lands in the store every list follows.
 * Only an ask that FOUND something covers the next list: someone still not in
 * the store is asked again, as they always were.
 */
function notAskedRecently(pubkeys: string[]): string[] {
  const now = Date.now();
  const due = pubkeys.filter((pk) => (askedAt.get(pk) ?? 0) + ASKED_FOR_MS <= now || !eventStore.getReplaceable(0, pk));
  due.forEach((pk) => askedAt.set(pk, now));
  return due;
}

/** Test seam. */
export function __resetAskedProfiles(): void {
  askedAt.clear();
}

/**
 * Names and avatars for a list of people — the ones a note mentions, a
 * thread's repliers, a face pile. Every held copy renders at once, however
 * old; the rest are asked for in one batch (fetchProfileMap), and any newer
 * copy that reaches the store later — the author queue re-asking after a copy
 * over an hour old, a search result, the person's own edit — replaces the
 * name on screen rather than waiting for the next visit.
 *
 * The queue decides who is re-asked: a copy learned within the hour was just
 * fetched, and a page of notes is too many people to re-ask on every render.
 * Each person is asked about once per few minutes however many lists show
 * them (notAskedRecently).
 */
export function useLiveProfiles(pubkeys: string[]): Map<string, ProfileContent> {
  const unique = useMemo(() => Array.from(new Set(pubkeys.filter((pk) => /^[0-9a-f]{64}$/i.test(pk)))).sort(), [pubkeys]);
  const key = unique.join(",");
  const coords = useMemo(() => unique.map((pubkey) => ({ kind: 0, pubkey })), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const held = useHeldReplaceables(coords);

  // Only a copy the store refused ever needs this map; it accumulates rather
  // than resetting, so a growing list never blanks a name it already had.
  const [fetched, setFetched] = useState<Map<string, ProfileContent>>(NO_PROFILES);
  useEffect(() => {
    if (!key) return;
    const due = notAskedRecently(key.split(","));
    if (!due.length) return;
    let alive = true;
    fetchProfileMap(due)
      .then((map) => {
        if (alive && map.size) setFetched((current) => new Map([...current, ...map]));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [key]);

  return useMemo(() => {
    if (!key) return NO_PROFILES;
    const out = new Map<string, ProfileContent>();
    for (const pubkey of unique) {
      // The store's copy is the newest seen (every fetch lands there); the
      // fetched map only covers a copy the store refused.
      const content = profileContentOf(held.get(`0:${pubkey}:`)) ?? fetched.get(pubkey);
      if (content) out.set(pubkey, content);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, held, fetched]);
}
