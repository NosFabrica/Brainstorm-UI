import { type Trends } from "../metrics";
import { ActivitySummaryCard } from "./ActivitySummaryCard";
import { RecentFailuresCard } from "./RecentFailuresCard";
import { TrendStripCard } from "./TrendStripCard";
import { type AdminUserListItem, type BrainstormRequestInstance } from "../types";

/**
 * The Overview tab: the range's throughput, its trend, and its failures
 * grouped by cause. Everything here reads the console's whole-range reads.
 */
export function OverviewTab({
  trends,
  activityCoverage,
  overviewAllActivity,
  overviewAllUsers,
  overviewLoading,
  overviewActivityQuery,
  overviewUsersQuery,
  retriggerOne,
  onTriggered,
  onOpenUser,
}: {
  trends: Trends;
  /** How far the loaded runs reach, for the caption. */
  activityCoverage: { count: number; total: number; loaded: number; loading: boolean; oldest: number | null };
  overviewAllActivity: BrainstormRequestInstance[];
  overviewAllUsers: AdminUserListItem[];
  overviewLoading: boolean;
  overviewActivityQuery: { isError: boolean; isSuccess: boolean; isLoading: boolean; error: unknown };
  overviewUsersQuery: { isError: boolean; isSuccess: boolean };
  retriggerOne: (pubkey: string) => Promise<void>;
  /** A run was sent (the console boosts its polling). */
  onTriggered: () => void;
  onOpenUser: (pubkey: string) => void;
}) {
  return (
    <div className="space-y-6" data-testid="panel-overview">
      <p className="text-[11px] text-slate-400 dark:text-slate-500" data-testid="trend-window-caption">
        <span className="font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          {trends.cfg.longLabel}
        </span>
        {activityCoverage.count > 0 && ` · ${activityCoverage.count} records`}
        {activityCoverage.oldest ? ` since ${new Date(activityCoverage.oldest).toLocaleDateString()}` : ""}
        {activityCoverage.loading
          ? ` · loading ${activityCoverage.loaded.toLocaleString()} of ${activityCoverage.total.toLocaleString()}…`
          : ""}
      </p>

      <ActivitySummaryCard
        overviewAllActivity={overviewAllActivity}
        overviewAllUsers={overviewAllUsers}
        overviewLoading={overviewLoading}
        status={
          overviewActivityQuery.isSuccess && overviewUsersQuery.isSuccess
            ? "connected"
            : overviewActivityQuery.isError || overviewUsersQuery.isError
              ? "disconnected"
              : "degraded"
        }
        trends={trends}
      />

      <TrendStripCard trends={trends} isLoading={overviewActivityQuery.isLoading} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <RecentFailuresCard
          overviewAllActivity={overviewAllActivity}
          overviewActivityQuery={overviewActivityQuery}
          overviewLoading={overviewLoading}
          trends={trends}
          retriggerOne={retriggerOne}
          onTriggered={onTriggered}
          onOpenUser={onOpenUser}
        />
      </div>
    </div>
  );
}
