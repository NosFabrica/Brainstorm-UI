import { NostrHealthCard } from "@/components/admin/NostrHealthCard";
import { Chip } from "@/components/ui/chip";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { apiClient } from "@/services/api";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, XCircle, Clock } from "lucide-react";
import { Fragment } from "react";
import { TriggerSourceBadge } from "../ActivityBadges";
import { CopyButton } from "../CopyButton";
import { FAILURE_STAGE_HINTS, pickFailureStage } from "../failures";
import { formatTimestamp, formatLatencyMs } from "../format";
import { type AdminUserHistoryPage } from "../types";

export function UserHistoryRow({
  pubkey,
  npub,
  taPubkey,
  schedulingName,
}: {
  pubkey: string;
  npub: string;
  taPubkey: string | null;
  schedulingName?: string;
}) {
  const historyQuery = useQuery<AdminUserHistoryPage>({
    queryKey: ["/api/admin/users", pubkey, "history", 10],
    queryFn: () => apiClient.getAdminUserHistory(pubkey, { page: 1, size: 10 }),
    staleTime: 30_000,
  });

  return (
    <tr
      className="bg-gradient-to-r from-slate-50/80 to-brand-primary/10 dark:bg-slate-900/40 dark:bg-none"
      data-testid={`row-user-detail-${pubkey.slice(0, 8)}`}
    >
      <td colSpan={8} className="px-5 py-4">
        <div className="space-y-4 text-[10px]">
          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Identity
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
                <p className="mb-0.5 text-[11px] uppercase text-slate-400 dark:text-slate-500">Full Pubkey</p>
                <div className="flex min-w-0 items-center gap-1">
                  <p className="truncate font-mono text-[11px] text-slate-700 dark:text-slate-200">{pubkey}</p>
                  <CopyButton text={pubkey} />
                </div>
              </div>
              <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
                <p className="mb-0.5 text-[11px] uppercase text-slate-400 dark:text-slate-500">Nostr npub</p>
                <div className="flex min-w-0 items-center gap-1">
                  <p className="truncate font-mono text-[11px] text-brand-primary dark:text-brand-link">{npub}</p>
                  <CopyButton text={npub} />
                </div>
              </div>
              {taPubkey && (
                <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
                  <p className="mb-0.5 text-[11px] uppercase text-slate-400 dark:text-slate-500">TA Pubkey</p>
                  <div className="flex min-w-0 items-center gap-1">
                    <p className="truncate font-mono text-[11px] text-emerald-600 dark:text-emerald-400">{taPubkey}</p>
                    <CopyButton text={taPubkey} />
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="mt-2 rounded-xl border border-brand-primary/15 bg-white p-4 shadow-sm dark:border-brand-primary/25 dark:bg-slate-900 dark:shadow-none">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-brand-deep" />
                <p
                  className="text-xs font-bold text-slate-800 dark:text-slate-200"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  Calculation History
                </p>
                {schedulingName && (
                  <Chip
                    tone="violet"
                    size="sm"
                    title="This user's current scheduling tier — how often scheduled runs recalculate them"
                  >
                    {schedulingName} schedule
                  </Chip>
                )}
              </div>
              {historyQuery.data && historyQuery.data.total > 0 && (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                  {historyQuery.data.total} records
                </span>
              )}
            </div>
            {historyQuery.isLoading ? (
              <div className="space-y-2">
                <div className="h-5 w-full animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
                <div className="h-5 w-full animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
                <div className="h-5 w-full animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
              </div>
            ) : historyQuery.isError ? (
              <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-500/25 dark:bg-red-500/10">
                <XCircle className="h-4 w-4 shrink-0 text-red-400" />
                <p className="text-xs text-red-600 dark:text-red-400">Failed to load calculation history</p>
              </div>
            ) : historyQuery.data && historyQuery.data.items.length > 0 ? (
              <div className="max-h-80 overflow-x-auto overflow-y-auto rounded-lg border border-slate-200 shadow-sm dark:border-slate-800">
                <table className="w-full border-collapse text-left">
                  <thead className="sticky top-0 z-10">
                    <tr className="border-b-2 border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-800">
                      <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                        Date
                      </th>
                      <th
                        className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300"
                        title="What triggered this run"
                      >
                        Source
                      </th>
                      <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                        Status
                      </th>
                      <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                        Algorithm
                      </th>
                      <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                        TA Status
                      </th>
                      <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                        Publication
                      </th>
                      <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                        Queue
                      </th>
                      <th
                        className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300"
                        title="Time from request to finished"
                      >
                        Duration
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <TooltipProvider delayDuration={150}>
                      {historyQuery.data.items.map((item, idx) => {
                        const statusLower = item.status.toLowerCase();
                        const taLower = item.ta_status?.toLowerCase() ?? "";
                        const pubLower = item.internal_publication_status?.toLowerCase() ?? "";
                        const statusFailed = statusLower === "failure";
                        const taFailed = taLower === "failure";
                        const pubFailed = pubLower === "failure" || pubLower === "failed";
                        const hasFail = statusFailed || taFailed || pubFailed;
                        const errorText = item.error?.message?.trim() || "";
                        const tooltipText = errorText || "No error details captured.";
                        const rowKey = item.private_id ?? idx;
                        return (
                          <Fragment key={rowKey}>
                            <tr
                              className={`border-b ${hasFail ? "border-red-200 bg-red-50/20 dark:border-red-500/25 dark:bg-red-500/10" : idx % 2 === 0 ? "border-slate-100 bg-white dark:border-slate-800/60 dark:bg-slate-900" : "border-slate-100 bg-slate-50/40 dark:border-slate-800/60 dark:bg-slate-900/40"} transition-colors hover:bg-brand-primary/10 dark:hover:bg-brand-primary/10`}
                            >
                              <td className="whitespace-nowrap px-3 py-2.5">
                                <span className="text-[11px] font-medium text-slate-700 dark:text-slate-200">
                                  {formatTimestamp(item.created_at)}
                                </span>
                              </td>
                              <td className="px-3 py-2.5">
                                <TriggerSourceBadge value={item.trigger_source} />
                              </td>
                              <td className="px-3 py-2.5">
                                {statusFailed ? (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span
                                        className="inline-flex cursor-help items-center rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-300"
                                        data-testid={`tooltip-history-error-status-${rowKey}`}
                                      >
                                        {item.status}
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent
                                      side="top"
                                      align="center"
                                      className="max-w-[320px] break-words bg-slate-950 font-mono text-xs text-slate-100"
                                    >
                                      {tooltipText}
                                    </TooltipContent>
                                  </Tooltip>
                                ) : (
                                  <span
                                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                      statusLower === "success"
                                        ? "border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300"
                                        : "border border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                                    }`}
                                  >
                                    {item.status}
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2.5">
                                <span className="font-mono text-[11px] font-semibold text-brand-deep">
                                  {item.algorithm}
                                </span>
                              </td>
                              <td className="px-3 py-2.5">
                                {item.ta_status ? (
                                  taFailed ? (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span
                                          className="inline-flex cursor-help items-center rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-300"
                                          data-testid={`tooltip-history-error-ta-${rowKey}`}
                                        >
                                          {item.ta_status}
                                        </span>
                                      </TooltipTrigger>
                                      <TooltipContent
                                        side="top"
                                        align="center"
                                        className="max-w-[320px] break-words bg-slate-950 font-mono text-xs text-slate-100"
                                      >
                                        {tooltipText}
                                      </TooltipContent>
                                    </Tooltip>
                                  ) : (
                                    <span
                                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                        taLower === "success"
                                          ? "border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300"
                                          : "border border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                                      }`}
                                    >
                                      {item.ta_status}
                                    </span>
                                  )
                                ) : (
                                  <span className="text-[11px] text-slate-300 dark:text-slate-600">—</span>
                                )}
                              </td>
                              <td className="px-3 py-2.5">
                                {item.internal_publication_status ? (
                                  pubFailed ? (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span
                                          className="inline-flex cursor-help items-center rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-300"
                                          data-testid={`tooltip-history-error-pub-${rowKey}`}
                                        >
                                          {item.internal_publication_status}
                                        </span>
                                      </TooltipTrigger>
                                      <TooltipContent
                                        side="top"
                                        align="center"
                                        className="max-w-[320px] break-words bg-slate-950 font-mono text-xs text-slate-100"
                                      >
                                        {tooltipText}
                                      </TooltipContent>
                                    </Tooltip>
                                  ) : (
                                    <span
                                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                        pubLower === "success" || pubLower === "published"
                                          ? "border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300"
                                          : pubLower === "pending" || pubLower === "in_progress"
                                            ? "border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300"
                                            : "border border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                                      }`}
                                    >
                                      {item.internal_publication_status}
                                    </span>
                                  )
                                ) : (
                                  <span className="text-[11px] text-slate-300 dark:text-slate-600">—</span>
                                )}
                              </td>
                              <td className="px-3 py-2.5">
                                <span className="text-[11px] font-medium tabular-nums text-slate-600 dark:text-slate-300">
                                  {item.how_many_others_with_priority > 0 ? item.how_many_others_with_priority : "—"}
                                </span>
                              </td>
                              <td className="px-3 py-2.5">
                                <span className="text-[11px] tabular-nums text-slate-600 dark:text-slate-300">
                                  {formatLatencyMs(item.created_at, item.updated_at) ?? "—"}
                                </span>
                              </td>
                            </tr>
                            {hasFail &&
                              (() => {
                                const stage = pickFailureStage({ statusFailed, taFailed, pubFailed });
                                const stageInfo = stage ? FAILURE_STAGE_HINTS[stage] : null;
                                return (
                                  <tr
                                    className="border-b border-red-200 bg-red-50/60 dark:border-red-500/25 dark:bg-red-500/10"
                                    data-testid={`row-history-error-${rowKey}`}
                                  >
                                    <td colSpan={8} className="px-4 py-2">
                                      <div className="flex items-start gap-2">
                                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />
                                        <div className="flex-1 space-y-1">
                                          {errorText ? (
                                            <span className="block break-all font-mono text-[11px] text-red-700 dark:text-red-300">
                                              {errorText}
                                            </span>
                                          ) : (
                                            <span className="block text-[11px] text-red-600/80 dark:text-red-400/80">
                                              No error details captured — check server logs.
                                            </span>
                                          )}
                                          {stageInfo && (
                                            <p
                                              className="text-[11px] leading-snug text-slate-600 dark:text-slate-300"
                                              data-testid={`text-failure-hint-${rowKey}`}
                                            >
                                              <span className="font-semibold">Where to look · {stageInfo.label}:</span>{" "}
                                              {stageInfo.hint}
                                            </p>
                                          )}
                                        </div>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })()}
                          </Fragment>
                        );
                      })}
                    </TooltipProvider>
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 p-3 dark:border-slate-800/60 dark:bg-slate-900">
                <Clock className="h-4 w-4 text-slate-300 dark:text-slate-600" />
                <p className="text-xs text-slate-400 dark:text-slate-500">No calculation history available</p>
              </div>
            )}
          </div>

          <NostrHealthCard pubkey={pubkey} taPubkey={taPubkey} />
        </div>
      </td>
    </tr>
  );
}
