import { AlertTriangle, CheckCircle2, XCircle, RefreshCw, Eye, Loader2 } from "lucide-react";
import { CopyButton } from "../CopyButton";
import { getFailureStage, extractErrorMessage } from "../failures";
import { type BrainstormRequestInstance } from "../types";

export function FailureDetailCard({
  item,
  onRetrigger,
  retriggerState,
  isInPipeline,
  onViewDetail,
  onNavigateToUser,
}: {
  item: BrainstormRequestInstance;
  onRetrigger?: (e: React.MouseEvent) => void;
  retriggerState?: "idle" | "confirming" | "running" | "done" | "error";
  isInPipeline?: boolean;
  onViewDetail?: (e: React.MouseEvent) => void;
  onNavigateToUser?: (pubkey: string) => void;
}) {
  const stage = getFailureStage(item) ?? "Pipeline";
  const errorText = extractErrorMessage(item);
  const fmtFull = (d: string | null) => {
    if (!d) return "—";
    try {
      return new Date(d.endsWith("Z") ? d : d + "Z").toLocaleString();
    } catch {
      return d;
    }
  };
  return (
    <div
      className="rounded-lg border border-red-200 bg-red-50/70 p-3 dark:border-red-500/25 dark:bg-red-500/10"
      data-testid={`failure-detail-${item.private_id ?? "x"}`}
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-red-800 dark:text-red-300">
              Failed at {stage}
            </span>
            <span className="text-[10px] text-red-600/80 dark:text-red-400/80">Request #{item.private_id}</span>
          </div>
          <p
            className="mt-1.5 whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-red-900 dark:text-red-300"
            data-testid={`failure-message-${item.private_id ?? "x"}`}
          >
            {errorText}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-red-700/80 dark:text-red-300/80">
            <span>
              Algorithm: <span className="font-mono">{item.algorithm || "—"}</span>
            </span>
            <span>Created: {fmtFull(item.created_at)}</span>
            <span>Updated: {fmtFull(item.updated_at)}</span>
            {item.how_many_others_with_priority > 0 && <span>Queue depth: {item.how_many_others_with_priority}</span>}
          </div>
          {item.pubkey && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px]">
              <span className="font-bold uppercase tracking-wider text-red-700/80 dark:text-red-300/80">User:</span>
              {onNavigateToUser ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onNavigateToUser(item.pubkey!);
                  }}
                  className="break-all text-left font-mono text-brand-deep hover:text-brand-accent hover:underline"
                  data-testid={`failure-pubkey-link-${item.private_id ?? "x"}`}
                >
                  {item.pubkey}
                </button>
              ) : (
                <span className="break-all font-mono text-slate-700 dark:text-slate-200">{item.pubkey}</span>
              )}
              <CopyButton text={item.pubkey} />
            </div>
          )}
          {item.parameters && (
            <div className="mt-2 text-[10px]">
              <span className="mb-0.5 block font-bold uppercase tracking-wider text-red-700/80 dark:text-red-300/80">
                Parameters
              </span>
              <p
                className="whitespace-pre-wrap break-all rounded border border-red-100 bg-white/70 px-2 py-1.5 font-mono text-slate-700 dark:border-red-500/20 dark:bg-slate-900/70 dark:text-slate-200"
                data-testid={`failure-parameters-${item.private_id ?? "x"}`}
              >
                {item.parameters}
              </p>
            </div>
          )}
          {item.count_values && (
            <div className="mt-2 text-[10px]">
              <span className="mb-0.5 block font-bold uppercase tracking-wider text-red-700/80 dark:text-red-300/80">
                Count Values
              </span>
              <p className="break-all rounded border border-red-100 bg-white/70 px-2 py-1.5 font-mono text-slate-700 dark:border-red-500/20 dark:bg-slate-900/70 dark:text-slate-200">
                {item.count_values}
              </p>
            </div>
          )}
          {(onRetrigger || onViewDetail) && (
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              {onRetrigger && item.pubkey && (
                <button
                  onClick={onRetrigger}
                  disabled={retriggerState === "running" || isInPipeline}
                  className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-[10px] font-semibold transition-all ${
                    isInPipeline
                      ? "cursor-not-allowed border-slate-200 bg-white text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500"
                      : retriggerState === "confirming"
                        ? "animate-pulse border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300"
                        : retriggerState === "done"
                          ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
                          : retriggerState === "error"
                            ? "border-red-300 bg-red-100 text-red-700 dark:border-red-500/30 dark:bg-red-500/15 dark:text-red-300"
                            : retriggerState === "running"
                              ? "border-slate-200 bg-white text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400"
                              : "border-red-300 bg-white text-red-700 hover:bg-red-100 dark:border-red-500/30 dark:bg-slate-900 dark:text-red-300 dark:hover:bg-red-500/15"
                  }`}
                  data-testid={`failure-retrigger-${item.private_id}`}
                >
                  {retriggerState === "running" ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : retriggerState === "confirming" ? (
                    <>
                      <RefreshCw className="h-3 w-3" />
                      <span>Confirm re-trigger?</span>
                    </>
                  ) : retriggerState === "done" ? (
                    <>
                      <CheckCircle2 className="h-3 w-3" />
                      <span>Re-triggered</span>
                    </>
                  ) : retriggerState === "error" ? (
                    <>
                      <XCircle className="h-3 w-3" />
                      <span>Re-trigger failed</span>
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-3 w-3" />
                      <span>Re-trigger GrapeRank</span>
                    </>
                  )}
                </button>
              )}
              {onViewDetail && (
                <button
                  onClick={onViewDetail}
                  className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-red-700 transition-colors hover:bg-red-50 dark:border-red-500/25 dark:bg-slate-900 dark:text-red-300 dark:hover:bg-red-500/10"
                  data-testid={`failure-view-detail-${item.private_id}`}
                >
                  <Eye className="h-3 w-3" /> View Full Request
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
