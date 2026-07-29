import { useQuery } from "@tanstack/react-query";
import { fetchEventsByFilter, fetchProfileMap } from "@/services/nostr";
import { fetchContactList, getFollowedPubkeys } from "@/services/socialActions";
import { apiClient } from "@/services/api";

/** One recently-active person to show as an avatar in a Your Network tile. */
export interface NetworkFace {
  pubkey: string;
  picture?: string;
  name?: string;
  /** Epoch seconds of their most recent note we saw. */
  lastActive: number;
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
function parseFollowerPubkeys(res: unknown): string[] {
  const items = (res as { data?: { items?: Array<string | { pubkey?: string }> } })?.data?.items ?? [];
  return items.map((e) => (typeof e === "string" ? e : e?.pubkey)).filter((p): p is string => !!p);
}

/**
 * The handful of people in your network who've posted most recently — split into
 * follows and followers — for the small "active recently" avatar clusters on the
 * dashboard's Your Network tiles.
 *
 * Honest by construction: a face only appears if we actually saw a recent note
 * from them (ranked by its timestamp). We deliberately don't claim "online" —
 * Nostr has no presence signal — only "active recently". Sources reuse what the
 * app already knows: your real kind-3 follows and the backend's follower list;
 * one batched note query covers both sets, then one profile fetch for the pics.
 */
export function useNetworkFaces(observer: string, enabled: boolean) {
  return useQuery<NetworkFaces>({
    queryKey: ["network-faces", observer],
    enabled: enabled && !!observer,
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async () => {
      const [following, followersRes] = await Promise.all([
        fetchContactList(observer).then((c) => Array.from(getFollowedPubkeys(c))).catch(() => [] as string[]),
        apiClient.getUserConnections(observer, "followed_by", { limit: 100, order: "desc" }).catch(() => null),
      ]);
      const followers = parseFollowerPubkeys(followersRes).filter((p) => p && p !== observer);
      const authors = Array.from(new Set([...following, ...followers])).slice(0, MAX_AUTHORS);
      if (authors.length === 0) return { following: [], followers: [] };

      const events = await fetchEventsByFilter({ kinds: [1], authors, limit: 200 }).catch(() => []);
      const lastActive = new Map<string, number>();
      for (const ev of events) {
        const at = (ev as { created_at?: number }).created_at ?? 0;
        if (at > (lastActive.get(ev.pubkey) ?? 0)) lastActive.set(ev.pubkey, at);
      }

      const pick = (set: string[]) =>
        set
          .filter((pk) => lastActive.has(pk))
          .sort((a, b) => (lastActive.get(b) ?? 0) - (lastActive.get(a) ?? 0))
          .slice(0, FACES);
      const followingTop = pick(following);
      const followersTop = pick(followers);

      const need = Array.from(new Set([...followingTop, ...followersTop]));
      const profiles = need.length ? await fetchProfileMap(need).catch(() => new Map()) : new Map();
      const toFace = (pk: string): NetworkFace => ({
        pubkey: pk,
        picture: profiles.get(pk)?.picture,
        name: profiles.get(pk)?.display_name || profiles.get(pk)?.name,
        lastActive: lastActive.get(pk) ?? 0,
      });
      return { following: followingTop.map(toFace), followers: followersTop.map(toFace) };
    },
  });
}
