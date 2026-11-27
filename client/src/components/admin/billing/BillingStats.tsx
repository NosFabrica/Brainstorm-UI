import { StatTile } from "@/components/ui/stat-tile";
import { rosterStats } from "./rosterStats";

/**
 * The tab's numbers in one line above its lists — counts, not the subject, so
 * they take a row and not a band. Faults is the way down to the report.
 */
export function BillingStats({ stats }: { stats: ReturnType<typeof rosterStats> }) {
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="billing-stats">
      <StatTile compact value={stats.active} label="Active" tone="success" data-testid="billing-stat-active" />
      <StatTile
        compact
        value={stats.past_due}
        label="Past due"
        tone={stats.past_due > 0 ? "warning" : "neutral"}
        data-testid="billing-stat-past_due"
      />
      <StatTile compact value={stats.pending} label="Pending" tone="neutral" data-testid="billing-stat-pending" />
      <StatTile compact value={stats.ending} label="Ending soon" tone="neutral" data-testid="billing-stat-ending" />
      <StatTile
        compact
        value={stats.faults}
        label="Faults"
        tone={stats.faults > 0 ? "warning" : "success"}
        role="button"
        tabIndex={0}
        onClick={() =>
          document
            .querySelector('[data-testid="card-billing-divergence"]')
            ?.scrollIntoView({ behavior: "smooth", block: "start" })
        }
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ")
            document
              .querySelector('[data-testid="card-billing-divergence"]')
              ?.scrollIntoView({ behavior: "smooth", block: "start" });
        }}
        className="cursor-pointer transition-colors hover:border-brand-accent/40"
        data-testid="billing-stat-faults"
      />
    </div>
  );
}
