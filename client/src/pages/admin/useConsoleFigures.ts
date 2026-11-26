import { useMemo } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import { withinRange, type AdminRange } from "../adminRange";
import { NONE } from "./constants";
import { computeHeaderFigures, computePipelineMetrics, computeTrends, countQueued, parseActivityTs } from "./metrics";
import type { AdminUserHistoryPage, AdminUsersPage } from "./types";

/**
 * What the console's whole-table reads come to: the range's runs and users,
 * the trend series, and the header's six figures, the system now.
 */
export function useConsoleFigures({
  range,
  overviewUsersQuery,
  overviewActivityQuery,
  allUsersQuery,
  adminStats,
}: {
  range: AdminRange;
  /** The range's users. */
  overviewUsersQuery: UseQueryResult<AdminUsersPage>;
  /** The range's runs and the period's before it. */
  overviewActivityQuery: UseQueryResult<AdminUserHistoryPage>;
  /** Every user. */
  allUsersQuery: UseQueryResult<AdminUsersPage>;
  /** The backend's counts, for the figures until every user has loaded. */
  adminStats: { scoredUsers: number; spAdopters: number; queueDepth: number } | null;
}) {
  const overviewAllUsers = overviewUsersQuery.data?.items ?? NONE;
  // What the Overview loaded (the range and the one before it, for deltas)
  // and the part inside the range, which every figure and chart reads.
  const overviewLoadedActivity = overviewActivityQuery.data?.items ?? NONE;
  const overviewAllActivity = useMemo(() => {
    const now = Date.now();
    return overviewLoadedActivity.filter((a) => withinRange(parseActivityTs(a.updated_at), range, now));
  }, [overviewLoadedActivity, range]);
  // Coverage of the loaded activity feed — surfaced so admins know how far the
  // trend windows actually reach (7d/30d may exceed the loaded records).
  const activityCoverage = useMemo(() => {
    const times = overviewAllActivity.map((a) => parseActivityTs(a.updated_at)).filter((t): t is number => !!t);
    return {
      count: overviewAllActivity.length,
      total: overviewActivityQuery.data?.total ?? overviewLoadedActivity.length,
      loaded: overviewLoadedActivity.length,
      loading:
        overviewActivityQuery.isFetching && overviewLoadedActivity.length < (overviewActivityQuery.data?.total ?? 0),
      oldest: times.length ? Math.min(...times) : null,
    };
  }, [
    overviewAllActivity,
    overviewLoadedActivity.length,
    overviewActivityQuery.data,
    overviewActivityQuery.isFetching,
  ]);
  const overviewLoading = overviewUsersQuery.isLoading || overviewActivityQuery.isLoading;

  const allUsers = allUsersQuery.data?.items ?? NONE;
  const allUsersTotal = allUsersQuery.data?.total ?? 0;

  // Everyone, now: the header cards.
  const nowMetrics = useMemo(
    () => computePipelineMetrics(allUsers, overviewLoadedActivity, allUsersTotal),
    [allUsers, overviewLoadedActivity, allUsersTotal],
  );

  const computedQueueDepth = useMemo(() => countQueued(allUsers), [allUsers]);

  const trends = useMemo(
    () => computeTrends(overviewLoadedActivity, overviewAllActivity, range, Date.now()),
    [overviewAllActivity, overviewLoadedActivity, range],
  );

  // The header's six figures — the system now — drawn once for the cards and
  // for the one-line strip the other tabs show.
  const headerFigures = computeHeaderFigures({
    nowMetrics,
    adminStats,
    computedQueueDepth,
    trends,
    hasActivity: !!overviewActivityQuery.data,
  });

  return {
    overviewAllUsers,
    overviewAllActivity,
    activityCoverage,
    overviewLoading,
    allUsers,
    nowMetrics,
    computedQueueDepth,
    trends,
    headerFigures,
  };
}
