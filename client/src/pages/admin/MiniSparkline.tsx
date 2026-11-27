import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Line, LineChart, ResponsiveContainer, Tooltip as RcTooltip } from "recharts";

export function MiniSparkline({
  data,
  timestamps,
  color = "#13d2e5",
  height = 22,
  width = 64,
  className,
  valueSuffix = "",
  valueLabel = "value",
}: {
  data: number[];
  timestamps?: number[];
  color?: string;
  height?: number;
  width?: number;
  className?: string;
  valueSuffix?: string;
  valueLabel?: string;
}) {
  if (!data || data.length < 2) {
    return (
      <div
        className={`inline-flex items-center justify-center text-[10px] text-slate-300 dark:text-slate-600 ${className ?? ""}`}
        style={{ height, width }}
        title="No trend data available yet"
        data-testid="mini-sparkline-empty"
      >
        <svg width={width - 4} height={4} viewBox={`0 0 ${width - 4} 4`} aria-hidden="true">
          <line x1="0" y1="2" x2={width - 4} y2="2" stroke="#cbd5e1" strokeWidth="1" strokeDasharray="2 2" />
        </svg>
      </div>
    );
  }
  const chartData = data.map((v, i) => ({
    i,
    v,
    ts: timestamps?.[i],
  }));
  return (
    <div style={{ width, height }} className={`inline-block ${className ?? ""}`} data-testid="mini-sparkline">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <RcTooltip
            cursor={{ stroke: color, strokeOpacity: 0.3, strokeWidth: 1 }}
            contentStyle={{
              fontSize: 10,
              borderRadius: 6,
              border: "1px solid #e2e8f0",
              padding: "4px 6px",
              lineHeight: 1.3,
              boxShadow: "0 4px 12px rgba(15, 23, 42, 0.12)",
              whiteSpace: "nowrap",
            }}
            wrapperStyle={{ outline: "none", zIndex: 9999, pointerEvents: "none" }}
            allowEscapeViewBox={{ x: true, y: true }}
            offset={12}
            labelFormatter={(_, items) => {
              const ts = items?.[0]?.payload?.ts as number | undefined;
              return ts
                ? new Date(ts).toLocaleString([], {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "";
            }}
            formatter={(val: number | string) => [`${val}${valueSuffix}`, valueLabel]}
          />
          <Line
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={1.5}
            dot={false}
            activeDot={{ r: 2.5, fill: color }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SparklineDetailsDialog({
  open,
  onOpenChange,
  label,
  data,
  timestamps,
  color = "#13d2e5",
  valueLabel = "value",
  valueSuffix = "",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  label: string;
  data: number[];
  timestamps?: number[];
  color?: string;
  valueLabel?: string;
  valueSuffix?: string;
}) {
  const chartData = (data ?? []).map((v, i) => ({ i, v, ts: timestamps?.[i] }));
  const formatTs = (ts: number | undefined) =>
    ts ? new Date(ts).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
  const rows = [...chartData].reverse();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="dialog-sparkline-details">
        <DialogHeader>
          <DialogTitle data-testid="text-sparkline-title">{label} trend</DialogTitle>
          <DialogDescription>Per-bucket values and timestamps from the recent trend.</DialogDescription>
        </DialogHeader>
        {chartData.length >= 2 ? (
          <>
            <div className="h-40 w-full" data-testid="chart-sparkline-details">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 4, left: 4 }}>
                  <RcTooltip
                    cursor={{ stroke: color, strokeOpacity: 0.3, strokeWidth: 1 }}
                    contentStyle={{
                      fontSize: 11,
                      borderRadius: 6,
                      border: "1px solid #e2e8f0",
                      padding: "4px 6px",
                      lineHeight: 1.3,
                    }}
                    labelFormatter={(_, items) => formatTs(items?.[0]?.payload?.ts as number | undefined)}
                    formatter={(val: number | string) => [`${val}${valueSuffix}`, valueLabel]}
                  />
                  <Line
                    type="monotone"
                    dataKey="v"
                    stroke={color}
                    strokeWidth={1.5}
                    dot={{ r: 2, fill: color }}
                    activeDot={{ r: 3.5, fill: color }}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="max-h-56 overflow-auto rounded-md border border-slate-200 dark:border-slate-800">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-slate-50 text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                  <tr>
                    <th className="px-2 py-1.5 text-left font-medium">Time</th>
                    <th className="px-2 py-1.5 text-right font-medium capitalize">{valueLabel}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, idx) => (
                    <tr
                      key={idx}
                      className="border-t border-slate-100 dark:border-slate-800/60"
                      data-testid={`row-sparkline-bucket-${idx}`}
                    >
                      <td className="px-2 py-1 text-slate-600 dark:text-slate-300">{formatTs(r.ts)}</td>
                      <td className="px-2 py-1 text-right font-medium tabular-nums text-slate-900 dark:text-slate-100">
                        {r.v}
                        {valueSuffix}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400" data-testid="text-sparkline-empty">
            No trend data available yet.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
