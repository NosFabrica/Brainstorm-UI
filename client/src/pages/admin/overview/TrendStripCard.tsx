import { Loader2 } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, Tooltip as RcTooltip, XAxis, YAxis } from "recharts";
import { DeltaIndicator } from "../DeltaIndicator";
import { type Trends } from "../metrics";

/** The range's calculations and failure rate, bucket by bucket, against the period before. */
export function TrendStripCard({ trends, isLoading }: { trends: Trends; isLoading: boolean }) {
  return (
    <div
      className="overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-sm dark:shadow-none"
      data-testid="card-trend-strip"
    >
      <div className="flex items-center justify-between gap-3 border-b border-brand-accent/10 px-5 py-3">
        <div>
          <h3
            className="text-sm font-bold text-slate-900 dark:text-slate-100"
            style={{ fontFamily: "var(--font-display)" }}
            data-testid="text-trend-strip-title"
          >
            {trends.cfg.longLabel}
          </h3>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-slate-500 dark:text-slate-400">
            <span>
              {trends.cmp.curTotal.toLocaleString()} calc{trends.cmp.curTotal === 1 ? "" : "s"}
              {trends.cmp.curSR !== null ? `, ${trends.cmp.curSR}% succeeded` : ""}
              {!trends.dataCoversWindow && trends.hasAnyActivity ? " · data may be partial" : ""}
            </span>
            <DeltaIndicator
              delta={trends.hasPriorWindow ? trends.cmp.curTotal - trends.cmp.prevTotal : null}
              insufficient={!trends.hasPriorWindow}
              label={trends.cfg.priorLabel}
            />
          </p>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-slate-500 dark:text-slate-400">
          <span className="inline-flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-accent" /> {trends.cfg.bucketUnitLabel}
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-red-400" /> Failure rate
          </span>
        </div>
      </div>
      <div className="px-3 py-3" style={{ height: 140 }}>
        {isLoading && !trends.hasAnyActivity ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-4 w-4 animate-spin text-slate-300 dark:text-slate-600" />
          </div>
        ) : !trends.hasAnyActivity ? (
          <div className="flex h-full items-center justify-center text-[11px] text-slate-400 dark:text-slate-500">
            No activity in the {trends.cfg.longLabel.toLowerCase()}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={trends.buckets.map((b) => ({
                bucket: trends.cfg.bucketLabelFn(b.t),
                ts: b.t,
                total: b.total,
                failureRate: b.success + b.failed === 0 ? 0 : Math.round((b.failed / (b.success + b.failed)) * 100),
              }))}
              margin={{ top: 6, right: 8, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id="totalGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#13d2e5" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#13d2e5" stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="failRateGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f87171" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#f87171" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="bucket"
                tick={{ fontSize: 9, fill: "#94a3b8" }}
                interval={trends.cfg.xAxisInterval}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                yAxisId="left"
                tick={{ fontSize: 9, fill: "#94a3b8" }}
                axisLine={false}
                tickLine={false}
                width={28}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fontSize: 9, fill: "#fca5a5" }}
                axisLine={false}
                tickLine={false}
                width={28}
                domain={[0, 100]}
                unit="%"
              />
              <RcTooltip
                contentStyle={{
                  fontSize: 11,
                  borderRadius: 8,
                  border: "1px solid #e2e8f0",
                  padding: "6px 8px",
                }}
                labelFormatter={(_, items) => {
                  const ts = items?.[0]?.payload?.ts as number | undefined;
                  return ts ? trends.cfg.bucketTooltipFn(ts) : "";
                }}
                formatter={(v: number, name: string) => (name === "Failure rate" ? [`${v}%`, name] : [v, name])}
              />
              <Area
                yAxisId="left"
                type="monotone"
                dataKey="total"
                name={trends.cfg.bucketUnitLabel}
                stroke="#13d2e5"
                strokeWidth={1.5}
                fill="url(#totalGrad)"
              />
              <Area
                yAxisId="right"
                type="monotone"
                dataKey="failureRate"
                name="Failure rate"
                stroke="#f87171"
                strokeWidth={1}
                fill="url(#failRateGrad)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
