import type { BulkRetrigger, BulkSource } from "@/components/admin/users/useBulkRetrigger";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";

/**
 * The last bulk re-trigger's outcome, under the table it was started from:
 * counts, "Retry failed only" and each failure's error.
 */
export function BulkResultBanner({
  bulk,
  source,
  spaced = false,
}: {
  bulk: BulkRetrigger;
  source: BulkSource;
  /** Leaves a margin below (the Activity card, where it sits above the table). */
  spaced?: boolean;
}) {
  const result = bulk.lastResult;
  if (!result || result.source !== source) return null;
  return (
    <div
      className={`${spaced ? "mb-3" : ""}flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 ${result.failures.length === 0 ? "border-emerald-300/50 bg-emerald-50/70 dark:border-emerald-500/30 dark:bg-emerald-500/10" : "border-red-300/50 bg-red-50/60 dark:border-red-500/30 dark:bg-red-500/10"}`}
      data-testid={`bulk-result-${source}`}
    >
      {result.failures.length === 0 ? (
        <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
      ) : (
        <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
      )}
      <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
        {result.successes.length} succeeded · {result.failures.length} failed
      </span>
      <div className="ml-auto flex items-center gap-2">
        {result.failures.length > 0 && (
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              bulk.ask({
                pubkeys: result.failures.map((f) => f.pubkey),
                source: "retry",
              })
            }
            disabled={bulk.running}
            className="no-default-hover-elevate no-default-active-elevate h-7 gap-1.5 text-xs"
            data-testid={`button-bulk-retry-failed-${source}`}
          >
            <RefreshCw className="h-3 w-3" /> Retry failed only
          </Button>
        )}
        <button
          onClick={bulk.dismiss}
          className="text-[10px] text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
          data-testid={`button-bulk-dismiss-${source}`}
        >
          Dismiss
        </button>
      </div>
      {result.failures.length > 0 && (
        <details className="mt-1.5 basis-full">
          <summary className="cursor-pointer select-none text-[10px] font-semibold text-red-700 dark:text-red-300">
            View failure details ({result.failures.length})
          </summary>
          <ul className="mt-1.5 max-h-40 space-y-0.5 overflow-auto" data-testid={`list-bulk-errors-${source}`}>
            {result.failures.map((f, i) => (
              <li
                key={`${f.pubkey}-${i}`}
                className="truncate font-mono text-[10px] text-red-900/90 dark:text-red-300/90"
                title={`${f.pubkey}: ${f.error}`}
              >
                <span className="text-red-600 dark:text-red-400">{f.pubkey.slice(0, 12)}…</span> — {f.error}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
