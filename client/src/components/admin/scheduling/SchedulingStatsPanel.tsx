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
    <div className="rounded-xl bg-gradient-to-br from-white/95 via-white/80 to-indigo-50/40 backdrop-blur-xl border border-[#7c86ff]/20 shadow-[0_0_15px_rgba(124,134,255,0.07)] px-3 py-3 flex flex-col">
      <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-[#7c86ff]/10 to-[#333286]/10 border border-[#7c86ff]/15 flex items-center justify-center mb-2">
        <Icon className="h-4 w-4 text-[#333286]" />
      </div>
      <p
        className="text-xl font-bold tracking-tight text-slate-900 tabular-nums"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {value}
      </p>
      <p className="text-[11px] text-slate-500 mt-0.5 leading-tight">{label}</p>
      {subtitle && <p className="text-[9px] text-slate-400 mt-0.5">{subtitle}</p>}
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
      : "bg-gradient-to-r from-[#7c86ff] to-[#333286]";
  return (
    <div className="flex items-center gap-3">
      <span className="w-44 shrink-0 truncate text-xs text-slate-600" title={label}>
        {label}
      </span>
      <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
        <div
          className={`h-full rounded-full ${fill} transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-16 shrink-0 text-right text-xs font-semibold tabular-nums text-slate-700">
        {valueLabel}
      </span>
    </div>
  );
}

function LivePill() {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium border bg-emerald-50 text-emerald-700 border-emerald-200"
      title="Auto-refreshes every 30 seconds"
      data-testid="badge-scheduling-live"
    >
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
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
      <p className="text-sm text-slate-500" role="status">
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

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
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
          value={
            data.median_publish_seconds != null
              ? formatDuration(data.median_publish_seconds)
              : "—"
          }
          icon={Timer}
          subtitle="Request → published"
        />
        <MetricCard
          label="Queue depth"
          value={String(queueTotal)}
          icon={Layers}
          subtitle="Across all lanes"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div>
          <h4 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Queue depths by lane
          </h4>
          {lanes.length === 0 ? (
            <p className="text-xs text-slate-400">No lanes reported.</p>
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
            <p className="mt-2 text-[11px] font-medium text-emerald-600">
              All lanes clear — nothing waiting in the queue.
            </p>
          )}
          <p className="mt-2 text-[11px] text-slate-400">
            Interactive lanes are internal and not editable policies.
          </p>
        </div>

        <div>
          <h4 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Per-tier slip
          </h4>
          {slip.length === 0 ? (
            <p className="text-xs text-slate-400">No slip reported.</p>
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
            <p className="mt-2 text-[11px] font-medium text-emerald-600">
              All tiers are on time.
            </p>
          )}
          <p className="mt-2 text-[11px] text-slate-400">
            How far past its interval each tier is running behind.
          </p>
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-amber-200/70 bg-amber-50/60 px-3 py-2">
        <Info className="h-3.5 w-3.5 text-amber-600 mt-0.5 shrink-0" />
        <p className="text-[11px] text-amber-700 leading-relaxed">
          The scheduler runs only when enabled globally (env-controlled); this
          panel manages policies, not the on/off switch.
        </p>
      </div>
    </div>
  );
}
