/**
 * The Network rows' scores and muter/reporter lists, per scope. A row's score
 * is whose perspective it was asked in and, for the reader's own, under which
 * preset, so there is one cache per scope (`rowScoreScope`), keyed by pubkey:
 * switching perspective or preset must not keep showing the other one's
 * numbers, and coming back finds the first one's still held. They live for the
 * page's lifetime, as refs.
 *
 * Both are filled from HTTP: the section rows carry their influence (written
 * as pages land, a refetched row's over the one held, as ProfilePage does),
 * and `fetchTrustScores` asks `/user/{pk}`, 8 at a time, for a row the
 * sections didn't score, which also brings its muters and reporters.
 * `trustLoadedCount` counts what landed, so the memos that read the caches
 * re-run.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ConnectionItem } from "@/hooks/useSelf";
import { apiClient } from "@/services/api";
import { toInfluenceMap, toPubkeys } from "@/services/graphHelpers";
import { trustScopeKey } from "@/services/profilePageCache";
import type { GroupKey } from "@/components/network/networkGroups";

export type RowGraphData = { muted_by?: string[]; reported_by?: string[] };

/** Whose rows these are: the perspective, and for the reader's own, who reads under which preset. */
export type RowScoreScope = { house: boolean; viewer: string | null | undefined; preset: string | null | undefined };

/**
 * The key of one scope's scores. Brainstorm's (`house`) are an unauthenticated
 * read, the same for every viewer and preset, and a preset change doesn't
 * invalidate them (`invalidatePresetDrivenReads`); the reader's own are theirs,
 * under their saved preset (`trustScopeKey`, which ProfilePage's caches use too).
 */
export function rowScoreScope({ house, viewer, preset }: RowScoreScope): string {
  return house ? "house" : `own|${trustScopeKey(viewer, preset)}`;
}

/** The cache for one scope, made the first time it is asked for. */
export function cacheFor<V>(caches: Map<string, Map<string, V>>, scope: string): Map<string, V> {
  let cache = caches.get(scope);
  if (!cache) {
    cache = new Map();
    caches.set(scope, cache);
  }
  return cache;
}

export function useRowScores(scope: RowScoreScope, networkData: Record<string, ConnectionItem[]>) {
  const { house } = scope;
  const scopeKey = rowScoreScope(scope);
  // Scores and graph data are the scope's: held per `scopeKey` below.
  const trustCaches = useRef(new Map<string, Map<string, number | null>>());
  const graphDataCaches = useRef(new Map<string, Map<string, RowGraphData>>());
  const [trustLoadedCount, setTrustLoadedCount] = useState(0);

  // One cache per scope, keyed [scope, pubkey]: switching perspective or preset
  // must not keep showing the other one's numbers. Coming back finds the first
  // one's still held.
  const trustCache = useMemo(() => ({ current: cacheFor(trustCaches.current, scopeKey) }), [scopeKey]);
  const graphDataCache = useMemo(() => ({ current: cacheFor(graphDataCaches.current, scopeKey) }), [scopeKey]);

  // Every section's rows carry their influence, the Flagged one too (the
  // server's `kind=flagged` page has the same row shape), so none of them needs
  // the heavy per-row `/user/{pk}` below. Leaving Flagged out sent up to 200 of
  // those, eight at a time, for a tab that already had its answers.
  // A refetched row's score replaces the one held: after a preset change the
  // sections keep their old pages while they refetch, and those land in the new
  // preset's cache first. An effect, not a memo: it writes the cache, then
  // re-renders the rows that read it.
  useEffect(() => {
    let added = 0;
    const allGroups: GroupKey[] = [
      "followed_by",
      "following",
      "muted_by",
      "muting",
      "reported_by",
      "reporting",
      "flagged",
    ];
    for (const groupKey of allGroups) {
      const items = networkData[groupKey];
      if (!items || items.length === 0) continue;
      const influenceMap = toInfluenceMap(items);
      influenceMap.forEach((influence, pk) => {
        if (trustCache.current.get(pk) !== influence) {
          trustCache.current.set(pk, influence);
          added += 1;
        }
      });
    }
    if (added) setTrustLoadedCount((prev) => prev + added);
  }, [networkData, trustCache]);

  const fetchTrustScores = useCallback(
    async (pubkeys: string[]) => {
      const unfetched = pubkeys.filter((pk) => !trustCache.current.has(pk));
      if (unfetched.length === 0) {
        return;
      }
      const batchSize = 8;
      for (let i = 0; i < unfetched.length; i += batchSize) {
        const batch = unfetched.slice(i, i + batchSize);
        const results = await Promise.allSettled(
          batch.map(async (pk) => {
            const res = await apiClient.getUserByPubkey(pk, { house });
            return res?.data ?? null;
          }),
        );
        results.forEach((res, idx) => {
          const pk = batch[idx];
          if (res.status === "fulfilled") {
            const graph = res.value?.graph ?? res.value;
            const influence = graph?.influence;
            trustCache.current.set(pk, typeof influence === "number" ? influence : null);
            graphDataCache.current.set(pk, {
              muted_by: toPubkeys(graph?.muted_by),
              reported_by: toPubkeys(graph?.reported_by),
            });
          } else {
            trustCache.current.set(pk, null);
          }
        });
        setTrustLoadedCount((prev) => prev + batch.length);
      }
    },
    [house, trustCache, graphDataCache],
  );

  return { trustCache, graphDataCache, trustLoadedCount, fetchTrustScores };
}
