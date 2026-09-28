import { useQuery } from "@tanstack/react-query";
import { Activity, Gauge, Layers, Timer, Info } from "lucide-react";
import { apiClient, type SchedulerStats } from "@/services/api";
import { formatDuration } from "@/lib/schedulingDurations";

const STATS_KEY = ["/api/admin/scheduling/stats"];
const POLL_MS = 30_000;

/** Round to at most one decimal so rates read cleanly (e.g. 30.285… → "30.3"). */
function formatCount(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function laneLabel(key: string): string {
  if (key === "sched:admin") return "Admin (interactive)";
  if (key === "sched:house") return "House (interactive)";
  if (key === "message_queue") return "Message queue";
  const m = key.match(/^sched:(\d+)$/);
  if (m) return `Priority ${m[1]} (scheduled)`;
  return key;
}

function MetricCard({
  label,
  value,
  icon: Icon,
  subtitle,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  subtitle?: string;
}) {
  return (
    <div className="flex flex-col rounded-xl border border-brand-accent/20 bg-gradient-to-br from-white/95 via-white/80 to-brand-primary/10 px-3 py-3 shadow-[0_0_15px_rgb(var(--brand-accent)/0.07)] backdrop-blur-xl dark:from-slate-900/95 dark:via-slate-900/80">
      <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg border border-brand-accent/15 bg-gradient-to-br from-brand-accent/10 to-brand-deep/10">
        <Icon className="h-4 w-4 text-brand-deep" />
      </div>
      <p
        className="text-xl font-bold tabular-nums tracking-tight text-slate-900 dark:text-slate-100"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {value}
      </p>
      <p className="mt-0.5 text-[11px] leading-tight text-slate-500 dark:text-slate-400">{label}</p>
      {subtitle && <p className="mt-0.5 text-[9px] text-slate-400 dark:text-slate-500">{subtitle}</p>}
    </div>
  );
}

/** Compact labeled horizontal bar (house progress-bar style). */
function StatBar({
  label,
  valueLabel,
  fraction,
  tone,
}: {
  label: string;
  valueLabel: string;
  fraction: number;
  tone: "brand" | "warn";
}) {
  const pct = Math.max(0, Math.min(1, fraction)) * 100;
  const fill =
    tone === "warn"
      ? "bg-gradient-to-r from-amber-400 to-orange-500"
      : "bg-gradient-to-r from-brand-accent to-brand-deep";
  return (
    <div className="flex items-center gap-3">
      <span className="w-44 shrink-0 truncate text-xs text-slate-600 dark:text-slate-300" title={label}>
        {label}
      </span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div className={`h-full rounded-full ${fill} transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-16 shrink-0 text-right text-xs font-semibold tabular-nums text-slate-700 dark:text-slate-200">
        {valueLabel}
      </span>
    </div>
  );
}

function LivePill() {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300"
      title="Auto-refreshes every 30 seconds"
      data-testid="badge-scheduling-live"
    >
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
      </span>
      Live · 30s
    </span>
  );
}

export function SchedulingStatsPanel({ active }: { active: boolean }) {
  const { data, isLoading, isError } = useQuery<SchedulerStats>({
    queryKey: STATS_KEY,
    queryFn: () => apiClient.getSchedulingStats(),
    enabled: active,
    refetchInterval: active ? POLL_MS : false,
  });

  if (isError) {
    return <p className="text-sm text-red-500">Failed to load scheduler stats.</p>;
  }
  if (isLoading || !data) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400" role="status">
        Loading scheduler stats…
      </p>
    );
  }

  const lanes = Object.entries(data.lane_depths);
  const slip = Object.entries(data.tier_slip_seconds);
  const queueTotal = lanes.reduce((sum, [, depth]) => sum + depth, 0);
  const laneMax = Math.max(1, ...lanes.map(([, d]) => d));
  const slipMax = Math.max(1, ...slip.map(([, s]) => s));

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <LivePill />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard
          label="Throughput / day"
          value={formatCount(data.throughput_per_day)}
          icon={Gauge}
          subtitle="Recalcs published"
        />
        <MetricCard
          label="Demand / day"
          value={formatCount(data.demand_per_day)}
          icon={Activity}
          subtitle="Recalcs requested"
        />
        <MetricCard
          label="Median publish"
          value={data.median_publish_seconds != null ? formatDuration(data.median_publish_seconds) : "—"}
          icon={Timer}
          subtitle="Request → published"
        />
        <MetricCard label="Queue depth" value={String(queueTotal)} icon={Layers} subtitle="Across all lanes" />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div>
          <h4 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Queue depths by lane
          </h4>
          {lanes.length === 0 ? (
            <p className="text-xs text-slate-400 dark:text-slate-500">No lanes reported.</p>
          ) : (
            <div className="space-y-2">
              {lanes.map(([key, depth]) => (
                <StatBar
                  key={key}
                  label={laneLabel(key)}
                  valueLabel={String(depth)}
                  fraction={depth / laneMax}
                  tone="brand"
                />
              ))}
            </div>
          )}
          {queueTotal === 0 && lanes.length > 0 && (
            <p className="mt-2 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
              All lanes clear — nothing waiting in the queue.
            </p>
          )}
          <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
            Interactive lanes are internal and not editable policies.
          </p>
        </div>

        <div>
          <h4 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Per-tier slip
          </h4>
          {slip.length === 0 ? (
            <p className="text-xs text-slate-400 dark:text-slate-500">No slip reported.</p>
          ) : (
            <div className="space-y-2">
              {slip.map(([key, seconds]) => (
                <StatBar
                  key={key}
                  label={key}
                  valueLabel={formatDuration(seconds)}
                  fraction={seconds / slipMax}
                  tone="warn"
                />
              ))}
            </div>
          )}
          {slip.length > 0 && slip.every(([, s]) => s === 0) && (
            <p className="mt-2 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
              All tiers are on time.
            </p>
          )}
          <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
            How far past its interval each tier is running behind.
          </p>
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-amber-200/70 bg-amber-50/60 px-3 py-2 dark:border-amber-500/25 dark:bg-amber-500/10">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
        <p className="text-[11px] leading-relaxed text-amber-700 dark:text-amber-300">
          The scheduler runs only when enabled globally (env-controlled); this panel manages policies, not the on/off
          switch.
        </p>
      </div>
    </div>
  );
}
