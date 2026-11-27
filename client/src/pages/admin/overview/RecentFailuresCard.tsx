import { Chip } from "@/components/ui/chip";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, XCircle, Eye, Loader2 } from "lucide-react";
import { ConfirmRetriggerButton } from "../ConfirmRetriggerButton";
import { getFailureStage, extractErrorMessage } from "../failures";
import { formatTimestamp, timeAgo, truncateError } from "../format";
import { type Trends } from "../metrics";
import { recentFailureGroups } from "./recentFailures";
import { type BrainstormRequestInstance } from "../types";

/**
 * The range's failed requests, grouped by stage and error, newest first: each
 * pattern's latest request, with "View latest affected user" and a re-trigger.
 */
export function RecentFailuresCard({
  overviewAllActivity,
  overviewActivityQuery,
  overviewLoading,
  trends,
  retriggerOne,
  onTriggered,
  onOpenUser,
}: {
  overviewAllActivity: BrainstormRequestInstance[];
  overviewActivityQuery: { isError: boolean; isSuccess: boolean; isLoading: boolean; error: unknown };
  overviewLoading: boolean;
  trends: Trends;
  retriggerOne: (pubkey: string) => Promise<void>;
  /** A run was sent (the console boosts its polling). */
  onTriggered: () => void;
  onOpenUser: (pubkey: string) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { groups: sortedGroups, totalFailures } = recentFailureGroups(
    overviewAllActivity,
    trends.cfg.windowMs,
    Date.now(),
  );
  const dataUnavailable =
    overviewActivityQuery.isError || (!overviewActivityQuery.isSuccess && !overviewActivityQuery.isLoading);
  // Nothing to act on: one line, not a block of empty space.
  const quiet = !dataUnavailable && !overviewLoading && totalFailures === 0;
  return (
    <div
      className={`overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-sm dark:shadow-none lg:col-span-2 ${quiet ? "border-border" : "border-red-200/70 dark:border-red-500/25"}`}
      data-testid="card-recent-failures"
    >
      <div className={quiet ? "px-5 py-3" : "border-b border-red-100 px-5 py-4 dark:border-red-500/20"}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3
              className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {quiet ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-red-500" />
              )}
              Recent Failures
            </h3>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {totalFailures === 0
                ? `No failures in ${trends.cfg.windowPhrase}.`
                : `${totalFailures} failed request${totalFailures === 1 ? "" : "s"} in ${trends.cfg.windowPhrase}, grouped into ${sortedGroups.length} pattern${sortedGroups.length === 1 ? "" : "s"}.`}
            </p>
          </div>
          <Chip
            tone={totalFailures === 0 ? "emerald" : "red"}
            className="px-2 py-1 font-bold tabular-nums"
            data-testid="badge-failure-count"
          >
            {totalFailures}
          </Chip>
        </div>
      </div>
      {quiet ? null : (
        <div className="p-5">
          {overviewActivityQuery.isError ? (
            <div
              className="flex flex-col items-center justify-center py-6 text-center"
              data-testid="failures-error-state"
            >
              <XCircle className="mb-2 h-8 w-8 text-red-400" />
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Couldn't load failure data</p>
              <p className="mt-1 max-w-md text-[11px] text-slate-500 dark:text-slate-400">
                {overviewActivityQuery.error instanceof Error
                  ? overviewActivityQuery.error.message
                  : "The /admin/activity endpoint did not respond. Failure status is unknown."}
              </p>
            </div>
          ) : overviewLoading && totalFailures === 0 ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-slate-300 dark:text-slate-600" />
            </div>
          ) : dataUnavailable ? (
            <div
              className="flex flex-col items-center justify-center py-6 text-center"
              data-testid="failures-unknown-state"
            >
              <AlertTriangle className="mb-2 h-8 w-8 text-amber-400" />
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Failure status unavailable</p>
              <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">Activity data has not loaded yet.</p>
            </div>
          ) : totalFailures === 0 ? (
            <div
              className="flex flex-col items-center justify-center py-6 text-center"
              data-testid="failures-empty-state"
            >
              <CheckCircle2 className="mb-2 h-8 w-8 text-emerald-400" />
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">All recent requests succeeded</p>
              <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                No errors found in the latest activity feed.
              </p>
            </div>
          ) : (
            <ul className="space-y-2.5" data-testid="list-recent-failures">
              {sortedGroups.map((g, idx) => {
                const stage = getFailureStage(g.latest) ?? "Pipeline";
                const errMsg = extractErrorMessage(g.latest);
                const userCount = g.pubkeys.size;
                return (
                  <li
                    key={idx}
                    className="rounded-lg border border-red-200 bg-white/70 p-3 dark:border-red-500/25 dark:bg-slate-900/70"
                    data-testid={`failure-group-${idx}`}
                  >
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-red-700 dark:text-red-300">
                            {stage}
                          </span>
                          {g.count > 1 && (
                            <span className="rounded-full border border-red-200 bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-red-700 dark:border-red-500/25 dark:bg-red-500/15 dark:text-red-300">
                              {g.count}× occurrences
                            </span>
                          )}
                          {userCount > 0 && (
                            <span className="text-[10px] text-slate-500 dark:text-slate-400">
                              {userCount} user{userCount === 1 ? "" : "s"} affected
                            </span>
                          )}
                          <span className="ml-auto text-[10px] text-slate-400 dark:text-slate-500">
                            {timeAgo(g.latest.updated_at) || formatTimestamp(g.latest.updated_at)}
                          </span>
                        </div>
                        <p className="break-words font-mono text-[11px] leading-relaxed text-slate-800 dark:text-slate-200">
                          {truncateError(errMsg, 220)}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          {g.latest.pubkey && (
                            <button
                              onClick={() => {
                                const pk = g.latest.pubkey!;
                                onOpenUser(pk);
                              }}
                              className="inline-flex items-center gap-1 text-[10px] font-semibold text-brand-deep hover:text-brand-accent"
                              data-testid={`failure-group-view-user-${idx}`}
                            >
                              <Eye className="h-3 w-3" /> View latest affected user
                            </button>
                          )}
                          {g.latest.pubkey && (
                            <ConfirmRetriggerButton
                              pubkey={g.latest.pubkey}
                              testId={`failure-group-retrigger-${idx}`}
                              onConfirm={async (pk) => {
                                try {
                                  await retriggerOne(pk);
                                  toast({
                                    title: "Request Queued",
                                    description: `Re-triggered GrapeRank for ${pk.slice(0, 12)}...`,
                                  });
                                  void queryClient.invalidateQueries({ queryKey: ["/api/admin/activity"] });
                                  void queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
                                  onTriggered();
                                } catch (err: unknown) {
                                  const msg = err instanceof Error ? err.message : "Unknown error";
                                  toast({
                                    title: "Re-trigger Failed",
                                    description: msg,
                                    variant: "destructive",
                                  });
                                  throw err;
                                }
                              }}
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
