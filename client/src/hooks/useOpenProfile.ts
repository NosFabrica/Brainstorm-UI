import { useCallback, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { queryClient } from "@/lib/queryClient";
import { apiClient } from "@/services/api";
import { fetchProfile } from "@/services/nostr";
import { getDisplayLabel, type SearchResult } from "@/lib/profileSearch";
import { pushRecentProfile } from "@/lib/recentSearches";
import { setProfileSeed, setStoredSearchSeed, type ProfileSeed } from "@/lib/profileSeed";
import { useSearchPov } from "@/hooks/useSearchPov";

/**
 * Opening a person found by search — from the box's suggestions, its recents, or the results
 * list. The profile page is seeded with what the search already knows (so it paints at once)
 * and its queries prefetched; hovering a row starts that early.
 */
export function useOpenProfile() {
  const [, setLocation] = useLocation();
  const { user, effectivePov } = useSearchPov();
  const prefetchTimers = useRef<Map<string, number>>(new Map());

  const seedAndPrefetch = useCallback((result: SearchResult) => {
    const hex = (result.pubkey || "").toLowerCase();
    if (!hex) return;
    const seed: ProfileSeed = {
      pubkey: hex,
      npub: result.npub,
      name: result.name,
      displayName: result.displayName,
      picture: result.picture,
      about: result.about,
      nip05: result.nip05,
      banner: result.banner,
      website: result.website,
      lud16: result.lud16,
      wotRank: result.wotRank ?? null,
      wotFollowers: result.wotFollowers ?? null,
      wotRankNosfabrica: result.wotRankNosfabrica ?? null,
      wotRankMywot: result.wotRankMywot ?? null,
      povFromSearch: effectivePov,
    };
    setProfileSeed(hex, seed);
    queryClient.prefetchQuery({
      queryKey: ["profile", hex],
      queryFn: async () => {
        const res = await apiClient.getUserByPubkey(hex);
        return res?.data ?? null;
      },
      staleTime: 5 * 60_000,
    }).catch(() => {});
    queryClient.prefetchQuery({
      queryKey: ["nostr-profile", hex],
      queryFn: async () => (await fetchProfile(hex)) ?? null,
      staleTime: 5 * 60_000,
    }).catch(() => {});
  }, [effectivePov]);

  const openProfile = useCallback((result: SearchResult) => {
    // Remember the people opened from search in the "Recent" list (avatar + name),
    // so they're one tap to get back to — not just the words typed into the box.
    pushRecentProfile({
      pubkey: result.pubkey,
      npub: result.npub,
      label: getDisplayLabel(result),
      picture: result.picture,
      nip05: result.nip05,
    });
    seedAndPrefetch(result);
    const hex = (result.pubkey || "").toLowerCase();
    const hasNosfabricaRank =
      typeof result.wotRankNosfabrica === "number" && Number.isFinite(result.wotRankNosfabrica);
    const persistNosfabrica = hasNosfabricaRank && !!hex;
    if (persistNosfabrica) {
      setStoredSearchSeed(hex, {
        pubkey: hex,
        npub: result.npub,
        name: result.name,
        displayName: result.displayName,
        picture: result.picture,
        about: result.about,
        nip05: result.nip05,
        banner: result.banner,
        website: result.website,
        lud16: result.lud16,
        wotRank: result.wotRank ?? null,
        wotFollowers: result.wotFollowers ?? null,
        wotRankNosfabrica: result.wotRankNosfabrica ?? null,
        wotRankMywot: result.wotRankMywot ?? null,
        povFromSearch: effectivePov,
      });
    }
    // Anonymous searchers go to the clean public /p page; members carry the house rank
    // along so the page can show where the search found them.
    if (!user || !persistNosfabrica) {
      setLocation(`/p/${result.npub}`);
      return;
    }
    setLocation(`/p/${result.npub}?showNosfabricaResult=1`);
  }, [seedAndPrefetch, setLocation, effectivePov, user]);

  const prefetchEnter = useCallback((result: SearchResult) => {
    const key = result.pubkey;
    if (!key || prefetchTimers.current.has(key)) return;
    const timer = window.setTimeout(() => {
      prefetchTimers.current.delete(key);
      seedAndPrefetch(result);
    }, 150);
    prefetchTimers.current.set(key, timer);
  }, [seedAndPrefetch]);

  const prefetchLeave = useCallback((result: SearchResult) => {
    const t = prefetchTimers.current.get(result.pubkey);
    if (t !== undefined) {
      window.clearTimeout(t);
      prefetchTimers.current.delete(result.pubkey);
    }
  }, []);

  useEffect(() => {
    const timers = prefetchTimers.current;
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      timers.clear();
    };
  }, []);

  return { openProfile, prefetchEnter, prefetchLeave };
}
