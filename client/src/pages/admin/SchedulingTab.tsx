import { SchedulingCard } from "@/components/admin/scheduling/SchedulingCard";
import { SchedulingStatsPanel } from "@/components/admin/scheduling/SchedulingStatsPanel";

/** The Scheduling tab: tier policies and the scheduler's health. */
export function SchedulingTab() {
  return (
    <div className="grid grid-cols-1 gap-6" data-testid="panel-scheduling">
      <div
        className="overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-sm dark:shadow-none"
        data-testid="card-scheduling-policies"
      >
        <div className="border-b border-brand-accent/10 px-5 py-4">
          <h3
            className="text-sm font-bold text-slate-900 dark:text-slate-100"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Scheduling Policies
          </h3>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Tier cadences for automatic GrapeRank recalculation
          </p>
        </div>
        <div className="px-5 py-4">
          <SchedulingCard active />
        </div>
      </div>
      <div
        className="overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-sm dark:shadow-none"
        data-testid="card-scheduling-stats"
      >
        <div className="border-b border-brand-accent/10 px-5 py-4">
          <h3
            className="text-sm font-bold text-slate-900 dark:text-slate-100"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Scheduler Health
          </h3>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Throughput, demand, queue depths and per-tier slip
          </p>
        </div>
        <div className="px-5 py-4">
          <SchedulingStatsPanel active />
        </div>
      </div>
    </div>
  );
}
