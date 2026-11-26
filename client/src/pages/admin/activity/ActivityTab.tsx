import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Activity, XCircle, RefreshCw, Loader2, Square, CheckSquare, MinusSquare } from "lucide-react";
import { useMemo } from "react";
import { type BulkRetrigger } from "@/components/admin/users/useBulkRetrigger";
import { LiveBadge } from "../LiveBadge";
import { StatusBadge } from "../StatusBadge";
import { ActivityRow } from "./ActivityRow";
import { FailureBreakdownCard } from "./FailureBreakdownCard";
import { type ActivityLog } from "./useActivityLog";
import { queuePositions, tierByPubkey } from "../metrics";
import { type PageSizeOption, type AdminUserListItem, type BrainstormRequestInstance } from "../types";
import { BACKEND_MAX_DAYS } from "../../adminRange";
import { BulkResultBanner } from "../BulkResultBanner";
import { useRequestDetail, RequestDetailDialog } from "./RequestDetailDialog";

/** The Activity tab: the failure breakdown and the range's log, a page at a time. */
export function ActivityTab({
  activity,
  bulk,
  triggering,
  rangeDays,
  isBoostActive,
  overviewAllActivity,
  overviewAllUsers,
  overviewLoading,
  overviewActivityQuery,
  userProfiles,
  retriggerOne,
  onTriggered,
  onOpenUser,
}: {
  activity: ActivityLog;
  bulk: BulkRetrigger;
  /** People with a run in flight, from any control. */
  triggering: ReadonlySet<string>;
  rangeDays: number;
  isBoostActive: boolean;
  /** The Overview's read of the range: the failure breakdown and the queue order. */
  overviewAllActivity: BrainstormRequestInstance[];
  /** The range's users, for each row's tier. */
  overviewAllUsers: readonly AdminUserListItem[];
  overviewLoading: boolean;
  overviewActivityQuery: { isError: boolean; error: unknown };
  userProfiles: Map<string, { name?: string; picture?: string }>;
  retriggerOne: (pubkey: string) => Promise<void>;
  /** A run was sent (the console boosts its polling). */
  onTriggered: () => void;
  onOpenUser: (pubkey: string) => void;
}) {
  const {
    adminActivityQuery,
    activityItems,
    activityTotal,
    activityTotalPages,
    activityPage,
    setActivityPage,
    activityPageSize,
    setActivityPageSize,
    selectedActivityRows,
    setSelectedActivityRows,
  } = activity;
  const { running: bulkRunning, statuses: bulkStatuses } = bulk;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const detail = useRequestDetail();

  // pubkey → current scheduling tier (best-effort: only users in the range's
  // set; activity records don't carry the tier).
  const schedulingTierByPubkey = useMemo(() => tierByPubkey(overviewAllUsers), [overviewAllUsers]);
  const queuePositionByPrivateId = useMemo(
    () => queuePositions(overviewAllActivity, activityItems),
    [overviewAllActivity, activityItems],
  );

  return (
    <div className="space-y-6" data-testid="panel-activity">
      <FailureBreakdownCard
        items={overviewAllActivity}
        isLoading={overviewLoading}
        isError={overviewActivityQuery.isError}
        errorMessage={overviewActivityQuery.error instanceof Error ? overviewActivityQuery.error.message : undefined}
        onViewUser={(pk) => {
          onOpenUser(pk);
        }}
      />

      <div
        className="overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-sm dark:shadow-none"
        data-testid="card-platform-activity"
      >
        <div className="border-b border-brand-accent/10 px-4 py-4 sm:px-5">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <h3
                className="text-sm font-bold text-slate-900 dark:text-slate-100"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Platform Activity
              </h3>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Every GrapeRank calculation record,{" "}
                {rangeDays === 1
                  ? "last 24 hours"
                  : rangeDays === BACKEND_MAX_DAYS
                    ? "all time"
                    : `last ${rangeDays} days`}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] text-slate-400 dark:text-slate-500">
                {activityTotal.toLocaleString()} total
              </span>
              <LiveBadge
                updatedAt={adminActivityQuery.dataUpdatedAt}
                boosting={isBoostActive}
                isFetching={adminActivityQuery.isFetching}
              />
              <StatusBadge
                status={
                  adminActivityQuery.isSuccess
                    ? "connected"
                    : adminActivityQuery.isError
                      ? "disconnected"
                      : adminActivityQuery.fetchStatus === "idle" && !adminActivityQuery.isError
                        ? "connected"
                        : "degraded"
                }
              />
            </div>
          </div>
        </div>
        <div className="p-3 sm:p-5">
          {adminActivityQuery.isLoading && !activityItems.length ? (
            <div className="animate-pulse space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-8 rounded-lg bg-slate-100 dark:bg-slate-800" />
              ))}
            </div>
          ) : adminActivityQuery.isError ? (
            <div className="py-8 text-center">
              <XCircle className="mx-auto mb-2 h-8 w-8 text-red-300" />
              <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">Failed to load activity</p>
              <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                {adminActivityQuery.error instanceof Error ? adminActivityQuery.error.message : "Unknown error"}
              </p>
            </div>
          ) : activityItems.length === 0 ? (
            <div className="py-8 text-center">
              <Activity className="mx-auto mb-2 h-8 w-8 text-slate-300 dark:text-slate-600" />
              <p className="text-sm font-semibold text-slate-400 dark:text-slate-500">No activity records</p>
              <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                No GrapeRank calculations have been recorded yet.
              </p>
            </div>
          ) : (
            <>
              {(() => {
                const selectedCount = selectedActivityRows.size;
                const dedupePubkeys = Array.from(
                  new Set(Array.from(selectedActivityRows.values()).filter((p): p is string => !!p)),
                );
                if (selectedCount === 0) return null;
                const liveCount = bulkRunning
                  ? Array.from(bulkStatuses.values()).filter((s) => s === "success" || s === "failed").length
                  : 0;
                const liveTotal = bulkRunning ? bulkStatuses.size : 0;
                const liveFailed = bulkRunning
                  ? Array.from(bulkStatuses.values()).filter((s) => s === "failed").length
                  : 0;
                return (
                  <div
                    className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-brand-accent/30 bg-brand-primary/10 px-3 py-2 dark:bg-brand-primary/10"
                    data-testid="bulk-toolbar-activity"
                  >
                    <CheckSquare className="h-4 w-4 text-brand-deep" />
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                      {selectedCount} selected
                      {dedupePubkeys.length !== selectedCount && (
                        <span className="font-normal text-slate-500 dark:text-slate-400">
                          {" "}
                          ({dedupePubkeys.length} unique)
                        </span>
                      )}
                    </span>
                    {bulkRunning && (
                      <span
                        className="text-[10px] font-medium text-amber-700 dark:text-amber-300"
                        data-testid="bulk-progress-activity"
                      >
                        {liveCount} of {liveTotal} triggered… {liveFailed > 0 ? `${liveFailed} failed` : ""}
                      </span>
                    )}
                    <div className="ml-auto flex items-center gap-2">
                      <Button
                        size="sm"
                        onClick={() => bulk.ask({ pubkeys: dedupePubkeys, source: "activity" })}
                        disabled={bulkRunning || dedupePubkeys.length === 0}
                        className="no-default-hover-elevate no-default-active-elevate h-7 gap-1.5 bg-brand-deep text-xs text-white hover:bg-brand-accent"
                        data-testid="button-bulk-retrigger-activity"
                      >
                        {bulkRunning ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                        Re-trigger {dedupePubkeys.length} user{dedupePubkeys.length !== 1 ? "s" : ""}
                      </Button>
                      <button
                        onClick={() => setSelectedActivityRows(new Map())}
                        disabled={bulkRunning}
                        className="text-[10px] text-slate-500 hover:text-slate-800 disabled:opacity-40 dark:text-slate-400 dark:hover:text-slate-200"
                        data-testid="button-bulk-clear-activity"
                      >
                        Clear selection
                      </button>
                    </div>
                  </div>
                );
              })()}
              <BulkResultBanner bulk={bulk} source="activity" spaced />
              <div className="overflow-x-auto">
                <table className="w-full min-w-[780px] text-left" data-testid="table-platform-activity">
                  <thead>
                    <tr className="border-b border-slate-200/60 dark:border-slate-800/60">
                      <th className="w-8 px-2 py-2">
                        {(() => {
                          const eligible = activityItems.filter(
                            (a) => !!a.pubkey && a.private_id !== undefined && a.private_id !== null,
                          );
                          const selectedOnPage = eligible.filter((a) =>
                            selectedActivityRows.has(a.private_id as number),
                          ).length;
                          const allSelected = eligible.length > 0 && selectedOnPage === eligible.length;
                          const someSelected = selectedOnPage > 0 && !allSelected;
                          return (
                            <button
                              type="button"
                              onClick={() => {
                                if (allSelected) {
                                  setSelectedActivityRows((prev) => {
                                    const next = new Map(prev);
                                    for (const a of eligible) next.delete(a.private_id as number);
                                    return next;
                                  });
                                } else {
                                  setSelectedActivityRows((prev) => {
                                    const next = new Map(prev);
                                    for (const a of eligible) next.set(a.private_id as number, a.pubkey as string);
                                    return next;
                                  });
                                }
                              }}
                              className="inline-flex items-center justify-center"
                              title={allSelected ? "Deselect all on page" : "Select all on page"}
                              data-testid="checkbox-activity-select-all"
                              disabled={eligible.length === 0}
                            >
                              {allSelected ? (
                                <CheckSquare className="h-3.5 w-3.5 text-brand-deep" />
                              ) : someSelected ? (
                                <MinusSquare className="h-3.5 w-3.5 text-brand-deep" />
                              ) : (
                                <Square
                                  className={`h-3.5 w-3.5 ${eligible.length ? "text-slate-400 dark:text-slate-500" : "text-slate-200"}`}
                                />
                              )}
                            </button>
                          );
                        })()}
                      </th>
                      <th className="px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Created
                      </th>
                      <th className="px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Updated
                      </th>
                      <th
                        className="px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400"
                        title="Time from created to updated"
                      >
                        Duration
                      </th>
                      <th className="px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        User
                      </th>
                      <th className="px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Source
                      </th>
                      <th className="px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Status
                      </th>
                      <th className="px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        TA Status
                      </th>
                      <th className="px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Pub Status
                      </th>
                      <th className="px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Algorithm
                      </th>
                      <th className="px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Queue
                      </th>
                      <th className="px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Req #
                      </th>
                      <th className="px-2 py-2 text-center text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {activityItems.map((item, idx) => {
                      const pid = item.private_id as number | null;
                      const isSelected = pid !== null && pid !== undefined && selectedActivityRows.has(pid);
                      const bs = item.pubkey ? bulkStatuses.get(item.pubkey) : undefined;
                      return (
                        <ActivityRow
                          key={item.private_id ?? idx}
                          item={item}
                          idx={idx}
                          profile={item.pubkey ? userProfiles.get(item.pubkey) : undefined}
                          schedulingName={item.pubkey ? schedulingTierByPubkey.get(item.pubkey) : undefined}
                          onViewDetail={detail.view}
                          selected={isSelected}
                          bulkStatus={bs}
                          triggering={!!item.pubkey && triggering.has(item.pubkey)}
                          queuePosition={
                            typeof item.private_id === "number"
                              ? queuePositionByPrivateId.get(item.private_id)
                              : undefined
                          }
                          onToggleSelect={() => {
                            if (!item.pubkey || pid === null || pid === undefined) return;
                            setSelectedActivityRows((prev) => {
                              const next = new Map(prev);
                              if (next.has(pid)) next.delete(pid);
                              else next.set(pid, item.pubkey as string);
                              return next;
                            });
                          }}
                          onNavigateToUser={(pubkey) => {
                            onOpenUser(pubkey);
                          }}
                          onRetrigger={async (pubkey) => {
                            try {
                              await retriggerOne(pubkey);
                              toast({
                                title: "Request Queued",
                                description: `Re-triggered GrapeRank for ${pubkey.slice(0, 12)}...`,
                              });
                              queryClient.invalidateQueries({ queryKey: ["/api/admin/activity"] });
                              queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
                              onTriggered();
                            } catch (err: unknown) {
                              const msg =
                                err instanceof Error
                                  ? err.message
                                  : typeof err === "object" && err !== null
                                    ? JSON.stringify(err)
                                    : "Unknown error";
                              toast({ title: "Re-trigger Failed", description: msg, variant: "destructive" });
                              throw err;
                            }
                          }}
                        />
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 flex flex-col items-start justify-between gap-2 border-t border-slate-100 pt-3 dark:border-slate-800/60 sm:flex-row sm:items-center">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">Rows per page:</span>
                  <select
                    className="rounded border border-slate-200 bg-white px-1.5 py-1 text-[10px] text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
                    value={activityPageSize}
                    onChange={(e) => {
                      setActivityPageSize(Number(e.target.value) as PageSizeOption);
                      setActivityPage(0);
                    }}
                    data-testid="select-activity-page-size"
                  >
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">
                    Page {activityPage + 1} of {activityTotalPages}
                  </span>
                  <div className="flex gap-1">
                    <button
                      className="rounded border border-slate-200 bg-white px-2 py-1 text-[10px] text-slate-600 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-900"
                      disabled={activityPage === 0}
                      onClick={() => setActivityPage((p) => Math.max(0, p - 1))}
                      data-testid="button-activity-prev"
                    >
                      Prev
                    </button>
                    <button
                      className="rounded border border-slate-200 bg-white px-2 py-1 text-[10px] text-slate-600 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-900"
                      disabled={activityPage + 1 >= activityTotalPages}
                      onClick={() => setActivityPage((p) => p + 1)}
                      data-testid="button-activity-next"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
              <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
                Click any row to expand details. Use the re-trigger button to re-run GrapeRank for that user.
              </p>
            </>
          )}
        </div>
      </div>

      <RequestDetailDialog detail={detail} />
    </div>
  );
}
