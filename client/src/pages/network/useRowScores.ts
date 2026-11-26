/**
 * The Network rows' scores and muter/reporter lists, per perspective. A row's
 * score is whose perspective it was asked in, so there is one cache per
 * `house`, keyed by pubkey: switching perspective must not keep showing the
 * other one's numbers, and coming back finds the first one's still held. They
 * live for the page's lifetime, as refs.
 *
 * Both are filled from HTTP: the section rows carry their influence (seeded
 * once per pubkey as pages land), and `fetchTrustScores` asks `/user/{pk}`, 8
 * at a time, for a row the sections didn't score, which also brings its
 * muters and reporters. `trustLoadedCount` counts what landed, so the memos
 * that read the caches re-run.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ConnectionItem } from "@/hooks/useSelf";
import { apiClient } from "@/services/api";
import { toInfluenceMap, toPubkeys } from "@/services/graphHelpers";
import type { GroupKey } from "@/components/network/networkGroups";

export type RowGraphData = { muted_by?: string[]; reported_by?: string[] };

/** The cache for one perspective, made the first time it is asked for. */
export function cacheFor<V>(caches: Map<boolean, Map<string, V>>, house: boolean): Map<string, V> {
  let cache = caches.get(house);
  if (!cache) {
    cache = new Map();
    caches.set(house, cache);
  }
  return cache;
}

export function useRowScores(house: boolean, networkData: Record<string, ConnectionItem[]>) {
  // Scores and graph data are the perspective's: held per `house` below.
  const trustCaches = useRef(new Map<boolean, Map<string, number | null>>());
  const graphDataCaches = useRef(new Map<boolean, Map<string, RowGraphData>>());
  const [trustLoadedCount, setTrustLoadedCount] = useState(0);

  // One cache per perspective, keyed [house, pubkey]: a row's score is whose
  // perspective it was asked in, so switching it must not keep showing the
  // other one's numbers. Coming back finds the first one's still held.
  const trustCache = useMemo(() => ({ current: cacheFor(trustCaches.current, house) }), [house]);
  const graphDataCache = useMemo(() => ({ current: cacheFor(graphDataCaches.current, house) }), [house]);

  // Every section's rows carry their influence, the Flagged one too (the
  // server's `kind=flagged` page has the same row shape), so none of them needs
  // the heavy per-row `/user/{pk}` below. Leaving Flagged out sent up to 200 of
  // those, eight at a time, for a tab that already had its answers.
  // An effect, not a memo: it writes the cache, then re-renders the rows that read it.
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
        if (!trustCache.current.has(pk)) {
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
