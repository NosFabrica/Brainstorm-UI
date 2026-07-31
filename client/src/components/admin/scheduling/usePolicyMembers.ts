import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { nip19 } from "nostr-tools";
import { apiClient, type SchedulingUserItem } from "@/services/api";
import { fetchProfileMap } from "@/services/nostr";
import type { ProfileContent } from "applesauce-core/helpers/profile";

const PREFERRED_SIZE = 100; // fewer round-trips when the backend allows it
const FALLBACK_SIZE = 20; // known-good size if the endpoint caps page size
const MAX_PAGES = 200; // runaway guard on how many pages we'll pull
const ENRICH_CAP = 2500; // soft ceiling on background name resolution
const ENRICH_CHUNK = 100; // kind-0 authors per relay batch

export interface PolicyMember {
  pubkey: string;
  npub: string;
  name?: string; // undefined until the kind-0 profile resolves
  picture?: string;
  lastPublished: string | null;
}

function encodeNpub(pubkey: string): string {
  try {
    return nip19.npubEncode(pubkey);
  } catch {
    return pubkey;
  }
}

async function loadAllPolicyUsers(
  policyId: number,
): Promise<{ items: SchedulingUserItem[]; total: number; truncated: boolean }> {
  // Prefer a larger page to cut round-trips, but fall back to the known-good
  // size if the endpoint rejects it (some backends cap page size).
  let size = PREFERRED_SIZE;
  let first;
  try {
    first = await apiClient.getSchedulingPolicyUsers(policyId, { page: 1, size });
  } catch {
    size = FALLBACK_SIZE;
    first = await apiClient.getSchedulingPolicyUsers(policyId, { page: 1, size });
  }
  const items = [...first.items];
  const pages = Math.min(first.pages ?? 1, MAX_PAGES);
  for (let p = 2; p <= pages; p++) {
    const pg = await apiClient.getSchedulingPolicyUsers(policyId, { page: p, size });
    items.push(...pg.items);
  }
  return {
    items,
    total: first.total ?? items.length,
    truncated: (first.pages ?? 1) > MAX_PAGES,
  };
}

/**
 * Loads a scheduling policy's *entire* member list (paged in the background,
 * capped) and progressively resolves display names/avatars from Nostr kind-0,
 * first members first. Lets the caller search/sort/filter fully client-side:
 * npub/hex + last-published work instantly; name-based features fill in as
 * profiles arrive (`enriching`).
 */
export function usePolicyMembers(policyId: number, enabled = true) {
  const usersKey = ["/api/admin/scheduling", policyId, "users", "all"];
  const {
    data,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: usersKey,
    queryFn: () => loadAllPolicyUsers(policyId),
    enabled,
  });

  const rawItems = useMemo(() => data?.items ?? [], [data]);
  const total = data?.total ?? 0;
  const truncated = data?.truncated ?? false;
  const pubkeyKey = rawItems.map((i) => i.pubkey).join(",");

  const [profiles, setProfiles] = useState<
    Map<string, { name?: string; picture?: string }>
  >(new Map());
  const [enriching, setEnriching] = useState(false);
  const requestedRef = useRef<Set<string>>(new Set());

  // Reset caches when switching to a different policy.
  useEffect(() => {
    requestedRef.current = new Set();
    setProfiles(new Map());
  }, [policyId]);

  // Progressive background enrichment (first members first, soft-capped).
  useEffect(() => {
    const pubkeys = pubkeyKey ? pubkeyKey.split(",") : [];
    if (!pubkeys.length) return;
    const target = pubkeys
      .slice(0, ENRICH_CAP)
      .filter((pk) => pk && !requestedRef.current.has(pk));
    if (!target.length) return;
    target.forEach((pk) => requestedRef.current.add(pk));

    let cancelled = false;
    setEnriching(true);
    (async () => {
      for (let i = 0; i < target.length; i += ENRICH_CHUNK) {
        if (cancelled) return;
        const chunk = target.slice(i, i + ENRICH_CHUNK);
        let map = new Map<string, ProfileContent>();
        try {
          map = await fetchProfileMap(chunk);
        } catch {
          /* best-effort — leave names unresolved */
        }
        if (cancelled) return;
        setProfiles((prev) => {
          const next = new Map(prev);
          for (const pk of chunk) {
            const c = map.get(pk);
            next.set(
              pk,
              c ? { name: c.display_name || c.name, picture: c.picture } : {},
            );
          }
          return next;
        });
      }
      if (!cancelled) setEnriching(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pubkeyKey]);

  const members: PolicyMember[] = useMemo(
    () =>
      rawItems.map((i) => {
        const p = profiles.get(i.pubkey);
        return {
          pubkey: i.pubkey,
          npub: encodeNpub(i.pubkey),
          name: p?.name,
          picture: p?.picture,
          lastPublished: i.last_time_published_graperank,
        };
      }),
    [rawItems, profiles],
  );

  return { members, total, truncated, isLoading, isError, enriching, refetch };
}
