import type { HeaderFigures, PipelineMetrics, Trends } from "./metrics";
import { Shield, Activity, AlertTriangle, CheckCircle2, Clock, UserCheck } from "lucide-react";
import { KpiCard } from "./KpiCard";
import { type KpiFilter } from "./types";

/** The Overview's six header cards: the system now, with the range's sparklines; four open the Users tab filtered. */
export function KpiStrip({
  figures,
  nowMetrics,
  trends,
  computedQueueDepth,
  hasSystemData,
  queuePosition,
  onKpi,
}: {
  figures: HeaderFigures;
  nowMetrics: PipelineMetrics | null;
  trends: Trends;
  computedQueueDepth: number | null;
  hasSystemData: boolean;
  queuePosition: number | null;
  onKpi: (filter: KpiFilter) => void;
}) {
  return (
    <div
      className="grid grid-cols-2 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"
      data-testid="section-kpi-strip"
    >
      <KpiCard
        label="Scored Users"
        value={figures.scored}
        icon={UserCheck}
        subtitle={nowMetrics ? `${nowMetrics.successRate}% have a GrapeRank score` : "Users with a GrapeRank score"}
        tooltip="Users whose last GrapeRank run succeeded — click to list them"
        onClick={() => onKpi("scored")}
        sparklineData={trends.successSeries}
        sparklineTimestamps={trends.bucketTimestamps}
        sparklineColor="#10b981"
        sparklineValueLabel="successes"
      />
      <KpiCard
        label="Assertions Published"
        value={figures.published}
        icon={Shield}
        subtitle={
          nowMetrics
            ? `${nowMetrics.taAdoptionRate}% publish trusted assertions`
            : "Users publishing trusted assertions"
        }
        tooltip="Users whose scores are published to relays as NIP-85 trusted assertions — click to list them"
        onClick={() => onKpi("sp_adopters")}
      />
      <KpiCard
        label="Queue Depth"
        value={figures.queue}
        icon={Clock}
        subtitle={
          computedQueueDepth !== null
            ? "Users awaiting calculation"
            : hasSystemData
              ? "Users awaiting calculation"
              : queuePosition !== null
                ? "Position in queue"
                : "Via graperankResult"
        }
        tooltip="Click to view queued users"
        onClick={() => onKpi("queue")}
      />
      <KpiCard
        label="Total Calcs"
        value={figures.calcs}
        icon={Activity}
        subtitle="Cumulative attempts, all users"
        tooltip="Cumulative calculation attempts across all users"
        sparklineData={trends.totalSeries}
        sparklineTimestamps={trends.bucketTimestamps}
        sparklineColor="#13d2e5"
        sparklineValueLabel="calcs / hr"
      />
      <KpiCard
        label="Success Rate"
        value={figures.rate}
        icon={CheckCircle2}
        subtitle="Cumulative success rate"
        tooltip="Successful calculations as % of attempted"
        sparklineData={trends.rateSeries}
        sparklineTimestamps={trends.bucketTimestamps}
        sparklineColor="#10b981"
        sparklineValueLabel="success rate"
        sparklineValueSuffix="%"
      />
      <KpiCard
        label="Failed Count"
        value={figures.failed}
        icon={AlertTriangle}
        subtitle="Users with a failed run"
        tooltip="Click to view users with failures"
        onClick={() => onKpi("failed")}
        sparklineData={trends.failedSeries}
        sparklineTimestamps={trends.bucketTimestamps}
        sparklineColor="#f87171"
        sparklineValueLabel="failures"
      />
    </div>
  );
}

/** The same six figures as one line, on every other tab. */
export function KpiCompact({ figures }: { figures: HeaderFigures }) {
  return (
    <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-300" data-testid="kpi-compact">
      <span>
        <b className="font-semibold text-slate-900 dark:text-slate-100">{figures.scored}</b> scored
      </span>
      <span>
        <b className="font-semibold text-slate-900 dark:text-slate-100">{figures.published}</b> published
      </span>
      <span>
        <b className="font-semibold text-slate-900 dark:text-slate-100">{figures.queue}</b> queued
      </span>
      <span>
        <b className="font-semibold text-slate-900 dark:text-slate-100">{figures.calcs}</b> calcs
      </span>
      <span>
        <b className="font-semibold text-slate-900 dark:text-slate-100">{figures.rate}</b> success
      </span>
      <span>
        <b className="font-semibold text-slate-900 dark:text-slate-100">{figures.failed}</b> failed
      </span>
    </p>
  );
}
