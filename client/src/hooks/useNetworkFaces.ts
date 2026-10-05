import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchEventsByFilter } from "@/services/nostr";
import { useLiveProfiles } from "@/hooks/useLiveProfile";
import { useStoreEvents } from "@/hooks/useStoreEvents";
import { useStoreReplaceable } from "@/hooks/useStoreReplaceable";
import { fetchContactList, getFollowedPubkeys } from "@/services/socialActions";
import { apiClient } from "@/services/api";
import { lookupTrustSignals } from "@/services/trustSignals";

/** One recently-active person to show as an avatar in a Your Network tile. */
export interface NetworkFace {
  pubkey: string;
  picture?: string;
  name?: string;
  /** Epoch seconds of their most recent note we saw. */
  lastActive: number;
  /** House influence from the connections response — free, no extra request.
   *  null for faces that only came from the contact list. */
  score01?: number | null;
}

export interface NetworkFaces {
  following: NetworkFace[];
  followers: NetworkFace[];
}

// Cap the relay author filter so the REQ stays small; rank the recent notes we
// get back rather than trying to be exhaustive. Five faces per tile.
const MAX_AUTHORS = 120;
const FACES = 5;

/** `followed_by` items are bare pubkey strings or `{ pubkey }` objects. */
// Keep the influence the connections endpoint already returns per item — the
// face-pile tier rings ride on it for free.
function parseFollowerEntries(res: unknown): { pubkey: string; influence: number | null }[] {
  const items =
    (res as { data?: { items?: Array<string | { pubkey?: string; influence?: number | null }> } })?.data?.items ?? [];
  return items
    .map((e) =>
      typeof e === "string"
        ? { pubkey: e, influence: null }
        : { pubkey: e?.pubkey ?? "", influence: typeof e?.influence === "number" ? e.influence : null },
    )
    .filter((e) => !!e.pubkey);
}

/**
 * The handful of people in your network who've posted most recently — split into
 * follows and followers — for the small "active recently" avatar clusters on the
 * dashboard's Your Network tiles. Faces fill in as notes and profiles land.
 *
 * Honest by construction: a face only appears if we actually saw a recent note
 * from them (ranked by its timestamp). We deliberately don't claim "online" —
 * Nostr has no presence signal — only "active recently". Sources reuse what the
 * app already knows: your real kind-3 follows and the backend's follower list;
 * one batched note query covers both sets, then one profile fetch for the pics.
 */
export function useNetworkFaces(observer: string, enabled: boolean): { data: NetworkFaces | undefined } {
  const on = enabled && !!observer;
  const contacts = useStoreReplaceable(3, on ? observer : null, () => fetchContactList(observer));
  const followersQuery = useQuery({
    queryKey: ["network-faces-followers", observer],
    enabled: on,
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: () =>
      apiClient.getUserConnections(observer, "followed_by", { limit: 100, order: "desc" }).catch(() => null),
  });

  const following = useMemo(() => Array.from(getFollowedPubkeys((contacts.event as never) ?? null)), [contacts.event]);
  const followerEntries = useMemo(
    () => parseFollowerEntries(followersQuery.data).filter((e) => e.pubkey !== observer),
    [followersQuery.data, observer],
  );
  const followers = useMemo(() => followerEntries.map((e) => e.pubkey), [followerEntries]);
  // Both sources in before the note ask: an author set that grows as they land would re-key it.
  const sourcesIn = contacts.settled && followersQuery.isFetched;
  const authors = useMemo(
    () => (sourcesIn ? Array.from(new Set([...following, ...followers])).slice(0, MAX_AUTHORS) : []),
    [sourcesIn, following, followers],
  );
  const authorsKey = authors.join(",");
  const notesFilter = useMemo(() => ({ kinds: [1], authors, limit: 200 }), [authorsKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const notes = useStoreEvents(
    on && authors.length ? `network-faces:${authorsKey}` : null,
    authors.length ? [notesFilter] : null,
    () => fetchEventsByFilter(notesFilter).catch(() => []),
  );

  const lastActive = useMemo(() => {
    const m = new Map<string, number>();
    for (const ev of notes.events) if (ev.created_at > (m.get(ev.pubkey) ?? 0)) m.set(ev.pubkey, ev.created_at);
    return m;
  }, [notes.events]);
  const pick = (set: string[]) =>
    set
      .filter((pk) => lastActive.has(pk))
      .sort((a, b) => (lastActive.get(b) ?? 0) - (lastActive.get(a) ?? 0))
      .slice(0, FACES);
  const followingTop = pick(following);
  const followersTop = pick(followers);
  const need = Array.from(new Set([...followingTop, ...followersTop]));
  const profiles = useLiveProfiles(need);

  // The following-side faces come from the contact list with no score. At most
  // FACES×2 of them made the cut, so fetching house influence for the gaps is
  // bounded — without it, half the pile would sit unringed next to a ringed half.
  const scoreByPk = useMemo(() => new Map(followerEntries.map((e) => [e.pubkey, e.influence])), [followerEntries]);
  const unscored = need.filter((pk) => scoreByPk.get(pk) == null).sort();
  const extraScores = useQuery({
    queryKey: ["network-faces-scores", unscored.join(",")],
    enabled: notes.settled && unscored.length > 0,
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async () => {
      const out = new Map<string, number>();
      await Promise.allSettled(
        unscored.map(async (pk) => {
          const { influence } = await lookupTrustSignals(pk);
          if (influence !== null) out.set(pk, influence);
        }),
      );
      return out;
    },
  });

  if (!on) return { data: undefined };
  if (sourcesIn && authors.length === 0) return { data: { following: [], followers: [] } };
  if (!notes.settled && !notes.events.length) return { data: undefined };
  const toFace = (pk: string): NetworkFace => ({
    pubkey: pk,
    picture: profiles.get(pk)?.picture,
    name: profiles.get(pk)?.display_name || profiles.get(pk)?.name,
    lastActive: lastActive.get(pk) ?? 0,
    score01: scoreByPk.get(pk) ?? extraScores.data?.get(pk) ?? null,
  });
  return { data: { following: followingTop.map(toFace), followers: followersTop.map(toFace) } };
}
