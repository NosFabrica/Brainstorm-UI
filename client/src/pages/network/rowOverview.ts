/**
 * The Network row expander's reads: the person's one overview entry (shared
 * with the Profile page, services/queries/userReads) and their stats under the
 * page's perspective, with a hover prefetch that skips an entry still fresh.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { overviewOptions, selectOverview, selectStats, statsOptions } from "@/services/queries/userReads";

/**
 * The Network row expander now uses the lightweight `/user/:pk/overview`
 * endpoint (counts + influence only, 30s timeout) instead of the heavy
 * `/user/:pk` endpoint (full follower/following/muter/reporter arrays,
 * 60s timeout). The overview is the one shared entry for this person
 * (services/queries/userReads), so hovering a row on Network and then
 * opening the profile (or vice versa) reuses it.
 *
 * The eager trust-score pass below still calls `/user/:pk` directly,
 * because it needs the `muted_by` / `reported_by` arrays to drive the
 * muter/reporter trust-score follow-up. That pass is out of scope here.
 */
export const PROFILE_OVERVIEW_STALE_MS = 5 * 60_000;

/** Whatever the rows are on, the expander reads the viewer's own overview, as the Profile page does. */
export const rowOverviewQuery = (pk: string) => overviewOptions(pk, "viewer");

export type UserOverview = {
  pubkey?: string;
  influence: number | null;
  counts: {
    followed_by: number;
    following: number;
    muted_by: number;
    muting: number;
    reported_by: number;
    reporting: number;
  };
};

/**
 * Fresh = present, non-null, and within staleTime. A cached `null` (from a
 * prior transient error) is NOT fresh, so expand/hover paths are allowed to
 * retry it instead of locking the panel into a stale empty state.
 */
export function isProfileOverviewFresh(pk: string): boolean {
  const state = queryClient.getQueryState(rowOverviewQuery(pk).queryKey);
  if (!state || state.status === "error") return false;
  if (selectOverview(state.data) === null) return false;
  return state.dataUpdatedAt > Date.now() - PROFILE_OVERVIEW_STALE_MS;
}

export function prefetchProfileOverview(pk: string): void {
  void queryClient.prefetchQuery(rowOverviewQuery(pk)).catch(() => {});
}

/** The expanded row's overview, flattened for the detail panel, and its verified/total stats. */
export function useExpandedRow(expandedPubkey: string | null, house: boolean) {
  // Reactive subscription for the currently expanded row. Re-uses the
  // person's one overview entry, the full Profile page's too, and
  // emits `isFetching` / `data` updates so the panel paints stale data
  // immediately (stale-while-revalidate) and refreshes when the background
  // fetch lands.
  const expandedDetailQuery = useQuery({
    ...rowOverviewQuery(expandedPubkey ?? ""),
    select: (envelope): UserOverview | null => selectOverview(envelope),
  });
  // Adapt overview shape (`{influence, counts:{...}}`) to the flat shape the
  // detail panel renders (`{followed_by, following, ..., influence}`). Counts
  // come back as numbers, not arrays — the panel's metric tiles already
  // accept either, so verified-subset display gracefully degrades to "total
  // count only" until/unless an array seed (graphData from the eager pass)
  // is also present.
  const expandedDetailGraph = useMemo(() => {
    const ov = expandedDetailQuery.data;
    if (!ov) return null;
    const c = ov.counts ?? ({} as UserOverview["counts"]);
    return {
      followed_by: c.followed_by ?? 0,
      following: c.following ?? 0,
      muted_by: c.muted_by ?? 0,
      muting: c.muting ?? 0,
      reported_by: c.reported_by ?? 0,
      reporting: c.reporting ?? 0,
      ...(ov.influence != null ? { influence: ov.influence } : {}),
    };
  }, [expandedDetailQuery.data]);
  const expandedIsLoading = !!expandedPubkey && expandedDetailQuery.isFetching && expandedDetailQuery.data == null;

  // Parallel server-side stats query for the expanded row. The person's one
  // stats entry for this perspective, the full Profile page's on the viewer's
  // own, so a click-through reuses it. Gives us accurate
  // Verified/Total counts for followed_by/following (and others) — the
  // lighter overview endpoint only returns total counts.
  type SectionStats = { total: number; verified: number };
  type StatsResponse = {
    followed_by: SectionStats;
    following: SectionStats;
    muted_by: SectionStats;
    muting: SectionStats;
    reported_by: SectionStats;
    reporting: SectionStats;
  };
  const expandedStatsQuery = useQuery({
    ...statsOptions(expandedPubkey ?? "", house ? "house" : "viewer"),
    select: (envelope): StatsResponse | null => selectStats(envelope),
  });
  const expandedStats = useMemo(() => {
    const s = expandedStatsQuery.data;
    if (!s) return undefined;
    return {
      followed_by: {
        verified: s.followed_by?.verified ?? 0,
        total: s.followed_by?.total ?? 0,
      },
      following: {
        verified: s.following?.verified ?? 0,
        total: s.following?.total ?? 0,
      },
      muted_by: {
        verified: s.muted_by?.verified ?? 0,
        total: s.muted_by?.total ?? 0,
      },
      muting: {
        verified: s.muting?.verified ?? 0,
        total: s.muting?.total ?? 0,
      },
      reported_by: {
        verified: s.reported_by?.verified ?? 0,
        total: s.reported_by?.total ?? 0,
      },
      reporting: {
        verified: s.reporting?.verified ?? 0,
        total: s.reporting?.total ?? 0,
      },
    } as Record<string, { verified: number; total: number }>;
  }, [expandedStatsQuery.data]);

  return { expandedDetailGraph, expandedIsLoading, expandedStats };
}
