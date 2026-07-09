import { useQuery } from "@tanstack/react-query";
import { apiClient, type SchedulerStats } from "@/services/api";
import { formatDuration } from "@/lib/schedulingDurations";

const STATS_KEY = ["/api/admin/scheduling/stats"];
const POLL_MS = 30_000;

function laneLabel(key: string): string {
  if (key === "sched:admin") return "Admin (interactive)";
  if (key === "sched:house") return "House (interactive)";
  if (key === "message_queue") return "Message queue";
  const m = key.match(/^sched:(\d+)$/);
  if (m) return `Priority ${m[1]} (scheduled)`;
  return key;
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
    </div>
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
      <p className="text-sm text-muted-foreground" role="status">
        Loading scheduler stats…
      </p>
    );
  }

  const lanes = Object.entries(data.lane_depths);
  const slip = Object.entries(data.tier_slip_seconds);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <MetricCard label="Throughput / day" value={String(data.throughput_per_day)} />
        <MetricCard label="Demand / day" value={String(data.demand_per_day)} />
        <MetricCard
          label="Median publish"
          value={
            data.median_publish_seconds != null
              ? formatDuration(data.median_publish_seconds)
              : "—"
          }
        />
      </div>

      <div>
        <h4 className="mb-1 text-xs font-semibold text-muted-foreground">Queue depths</h4>
        {lanes.length === 0 ? (
          <p className="text-xs text-muted-foreground">No lanes reported.</p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {lanes.map(([key, depth]) => (
                <tr key={key}>
                  <td className="py-0.5 pr-4">{laneLabel(key)}</td>
                  <td className="py-0.5 pr-4 text-right tabular-nums">{depth}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-1 text-[11px] text-muted-foreground">
          Interactive lanes are not editable policies.
        </p>
      </div>

      <div>
        <h4 className="mb-1 text-xs font-semibold text-muted-foreground">Per-tier slip</h4>
        {slip.length === 0 ? (
          <p className="text-xs text-muted-foreground">No slip reported.</p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {slip.map(([key, seconds]) => (
                <tr key={key}>
                  <td className="py-0.5 pr-4">{key}</td>
                  <td className="py-0.5 pr-4 text-right tabular-nums">
                    {formatDuration(seconds)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="rounded bg-amber-500/10 px-2 py-1 text-[11px] text-amber-600">
        Scheduler runs only when enabled globally (env-controlled); this panel manages
        policies, not the on/off switch.
      </p>
    </div>
  );
}
