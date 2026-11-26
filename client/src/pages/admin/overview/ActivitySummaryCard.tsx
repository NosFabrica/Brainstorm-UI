import { Users, Activity, CheckCircle2, XCircle } from "lucide-react";
import { StatusBadge } from "../StatusBadge";
import { isFailedActivity } from "../failures";
import { type Trends } from "../metrics";
import { type AdminUserListItem, type BrainstormRequestInstance } from "../types";

/** The range's throughput: requests, successes, failures and active users, and the last activity. */
export function ActivitySummaryCard({
  overviewAllActivity,
  overviewAllUsers,
  overviewLoading,
  status,
  trends,
}: {
  overviewAllActivity: BrainstormRequestInstance[];
  overviewAllUsers: AdminUserListItem[];
  overviewLoading: boolean;
  /** Whether the range's reads answered. */
  status: "connected" | "degraded" | "disconnected";
  trends: Trends;
}) {
  const actSummaryActivity = overviewAllActivity;
  const actSummaryUsers = overviewAllUsers;
  const actSummaryLoading = overviewLoading;
  // Already cut to the dashboard's range.
  const filteredItems = actSummaryActivity;
  const rangeLong = trends.cfg.longLabel;
  const rangeShort = trends.cfg.shortLabel;
  const filteredSuccess = filteredItems.filter((a) => a.status?.toLowerCase() === "success").length;
  const filteredFailed = filteredItems.filter(isFailedActivity).length;
  const filteredTotal = filteredItems.length;
  const sortedByUpdate = [...actSummaryUsers].sort((a, b) => {
    const ta = new Date(a.last_updated || "").getTime() || 0;
    const tb = new Date(b.last_updated || "").getTime() || 0;
    return tb - ta;
  });
  const lastActivityTs = sortedByUpdate[0]?.last_updated ?? null;
  const uniquePubkeys = new Set(filteredItems.map((a) => a.pubkey).filter(Boolean)).size;

  return (
    <div
      className="overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-sm dark:shadow-none"
      data-testid="card-activity-summary"
    >
      <div className="border-b border-brand-accent/10 px-4 py-4 sm:px-5">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div className="flex min-w-0 items-center gap-2">
            <div>
              <h3
                className="text-sm font-bold text-slate-900 dark:text-slate-100"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Activity Summary
              </h3>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Platform-wide throughput — <span className="font-semibold text-brand-deep">{rangeLong}</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={status} />
          </div>
        </div>
      </div>
      <div className="p-4 sm:p-5">
        {actSummaryLoading ? (
          <div className="grid animate-pulse grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-20 rounded-xl bg-slate-100 dark:bg-slate-800" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div
              className="rounded-xl border border-slate-100 bg-white/50 p-3 text-center dark:border-slate-800/60 dark:bg-slate-900/50"
              data-testid="summary-total"
            >
              <Activity className="mx-auto mb-1 h-4 w-4 text-brand-deep" />
              <p className="text-lg font-bold text-slate-900 dark:text-slate-100">{filteredTotal.toLocaleString()}</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">{rangeShort} Requests</p>
            </div>
            <div
              className="rounded-xl border border-slate-100 bg-white/50 p-3 text-center dark:border-slate-800/60 dark:bg-slate-900/50"
              data-testid="summary-success"
            >
              <CheckCircle2 className="mx-auto mb-1 h-4 w-4 text-emerald-500" />
              <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                {filteredSuccess.toLocaleString()}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">{rangeShort} Succeeded</p>
            </div>
            <div
              className="rounded-xl border border-slate-100 bg-white/50 p-3 text-center dark:border-slate-800/60 dark:bg-slate-900/50"
              data-testid="summary-failed"
            >
              <XCircle className="mx-auto mb-1 h-4 w-4 text-red-400" />
              <p className="text-lg font-bold text-red-500">{filteredFailed.toLocaleString()}</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">{rangeShort} Failed</p>
            </div>
            <div
              className="rounded-xl border border-slate-100 bg-white/50 p-3 text-center dark:border-slate-800/60 dark:bg-slate-900/50"
              data-testid="summary-unique-users"
            >
              <Users className="mx-auto mb-1 h-4 w-4 text-blue-500" />
              <p className="text-lg font-bold text-slate-900 dark:text-slate-100">{uniquePubkeys.toLocaleString()}</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">{rangeShort} Active Users</p>
            </div>
          </div>
        )}
        {lastActivityTs && !actSummaryLoading && (
          <p className="mt-3 text-[11px] text-slate-400 dark:text-slate-500">
            Last platform activity:{" "}
            {(() => {
              try {
                const d = new Date(lastActivityTs.endsWith("Z") ? lastActivityTs : lastActivityTs + "Z");
                return d.toLocaleString();
              } catch {
                return lastActivityTs;
              }
            })()}
          </p>
        )}
      </div>
    </div>
  );
}
