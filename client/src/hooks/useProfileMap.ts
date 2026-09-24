import { useMemo } from "react";
import type { NostrEvent } from "nostr-tools";
import { kind0ToSearchResult } from "@/services/search";
import type { SearchResult } from "@/lib/profileSearch";
import { useLiveProfiles } from "@/hooks/useLiveProfile";

/**
 * Profiles for a handful of pubkeys, store-first: whatever kind-0s we already
 * hold render on the first paint — the device's copy too, however old — the
 * rest arrive from one batched relay fetch, and a newer copy that lands later
 * replaces the one shown (useLiveProfiles). The face-pile hook — reviewers,
 * zappers, followers.
 */
export function useProfileMap(pubkeys: string[]): Map<string, SearchResult> {
  const profiles = useLiveProfiles(pubkeys);
  return useMemo(() => {
    const out = new Map<string, SearchResult>();
    for (const [pubkey, content] of profiles) {
      out.set(
        pubkey,
        kind0ToSearchResult({
          kind: 0,
          pubkey,
          content: JSON.stringify(content),
          tags: [],
          created_at: 0,
          id: "",
          sig: "",
        } as NostrEvent),
      );
    }
    return out;
  }, [profiles]);
}
