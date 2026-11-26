import { Chip } from "@/components/ui/chip";
import { Shield, AlertTriangle, XCircle, Clock, UserCheck } from "lucide-react";
import { type KpiFilter } from "../types";

/** Which header card the directory is filtered by, and the way out of it. */
export function KpiFilterBadge({ kpiFilter, onClear }: { kpiFilter: KpiFilter; onClear: () => void }) {
  return (
    <div
      className="flex items-center gap-2 border-b border-brand-accent/10 bg-brand-primary/10 px-3 py-2 dark:bg-brand-primary/10 sm:px-5"
      data-testid="kpi-filter-badge"
    >
      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        Filtered:
      </span>
      <Chip
        size="sm"
        tone={
          kpiFilter === "scored"
            ? "emerald"
            : kpiFilter === "sp_adopters"
              ? "indigo"
              : kpiFilter === "failed"
                ? "red"
                : "amber"
        }
        className="gap-1.5 px-2.5 py-1 font-bold uppercase tracking-wider"
      >
        {kpiFilter === "scored" && (
          <>
            <UserCheck className="h-3 w-3" /> Scored Users
          </>
        )}
        {kpiFilter === "sp_adopters" && (
          <>
            <Shield className="h-3 w-3" /> SP Adopters
          </>
        )}
        {kpiFilter === "queue" && (
          <>
            <Clock className="h-3 w-3" /> In Queue
          </>
        )}
        {kpiFilter === "failed" && (
          <>
            <AlertTriangle className="h-3 w-3" /> Failed
          </>
        )}
      </Chip>
      <button
        onClick={onClear}
        className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[10px] font-semibold text-slate-500 transition-colors hover:bg-white/80 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-900/80 dark:hover:text-slate-200"
        data-testid="button-clear-kpi-filter"
      >
        <XCircle className="h-3 w-3" />
        Clear filter
      </button>
    </div>
  );
}
