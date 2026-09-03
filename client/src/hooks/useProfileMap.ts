import { useEffect, useState } from "react";
import type { NostrEvent } from "nostr-tools";
import { eventStore } from "@/lib/eventStore";
import { fetchProfileMap } from "@/services/nostr";
import { kind0ToSearchResult } from "@/services/search";
import type { SearchResult } from "@/lib/profileSearch";

/**
 * Profiles for a handful of pubkeys, store-first: whatever kind-0s we already
 * hold render on the first paint, the rest arrive from one batched relay
 * fetch. The face-pile hook — reviewers, zappers, followers.
 */
export function useProfileMap(pubkeys: string[]): Map<string, SearchResult> {
  const [map, setMap] = useState<Map<string, SearchResult>>(new Map());
  const key = pubkeys.join(",");
  useEffect(() => {
    const known = new Map<string, SearchResult>();
    const missing: string[] = [];
    for (const pk of pubkeys) {
      if (!pk) continue;
      const stored = eventStore.getReplaceable(0, pk);
      if (stored) known.set(pk, kind0ToSearchResult(stored as NostrEvent));
      else missing.push(pk);
    }
    setMap(known);
    if (missing.length === 0) return;
    let alive = true;
    void fetchProfileMap(missing).then((res) => {
      if (!alive || res.size === 0) return;
      setMap((prev) => {
        const next = new Map(prev);
        for (const [pk, content] of res) {
          next.set(
            pk,
            kind0ToSearchResult({
              kind: 0,
              pubkey: pk,
              content: JSON.stringify(content),
              tags: [],
              created_at: 0,
              id: "",
              sig: "",
            } as NostrEvent),
          );
        }
        return next;
      });
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return map;
}
