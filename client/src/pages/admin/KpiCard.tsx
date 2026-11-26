import { ChevronUp, ChevronDown, Maximize2 } from "lucide-react";
import { useState } from "react";
import { MiniSparkline, SparklineDetailsDialog } from "./MiniSparkline";
import { StatusBadge } from "./StatusBadge";

export function KpiCard({
  label,
  value,
  icon: Icon,
  trend,
  subtitle,
  unsupported,
  tooltip,
  onClick,
  sparklineData,
  sparklineTimestamps,
  sparklineColor,
  sparklineValueLabel,
  sparklineValueSuffix,
  deltaSlot,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  trend?: { value: string; up: boolean };
  subtitle?: string;
  unsupported?: boolean;
  tooltip?: string;
  onClick?: () => void;
  sparklineData?: number[];
  sparklineTimestamps?: number[];
  sparklineColor?: string;
  sparklineValueLabel?: string;
  sparklineValueSuffix?: string;
  deltaSlot?: React.ReactNode;
}) {
  const [trendOpen, setTrendOpen] = useState(false);
  const hasSparkline = !unsupported && Array.isArray(sparklineData) && sparklineData.length >= 2;
  const testIdSlug = label.toLowerCase().replace(/\s+/g, "-");
  return (
    <>
      <div
        className={`group relative z-0 flex min-h-[120px] flex-col rounded-xl border border-border bg-card px-3 py-3 text-card-foreground shadow-sm transition-all duration-300 hover:z-30 hover:-translate-y-0.5 hover:border-brand-accent/40 hover:shadow-[0_12px_24px_-8px_rgb(var(--brand-accent)/0.2)] dark:shadow-none ${onClick ? "cursor-pointer" : ""}`}
        data-testid={`kpi-${testIdSlug}`}
        title={tooltip}
        onClick={onClick}
      >
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl">
          <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-transparent to-brand-accent/5 opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
        </div>
        <div className="relative mb-2 flex items-start justify-between">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-brand-accent/15 bg-gradient-to-br from-brand-accent/10 to-brand-deep/10">
            <Icon className="h-4 w-4 text-brand-deep" />
          </div>
          {trend && (
            <span
              className={`flex items-center gap-0.5 text-[10px] font-semibold ${trend.up ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}
            >
              {trend.up ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {trend.value}
            </span>
          )}
        </div>
        <div className="relative flex items-end justify-between gap-2">
          <p
            className={`text-xl font-bold tracking-tight ${unsupported ? "text-slate-300 dark:text-slate-600" : "text-slate-900 dark:text-slate-100"}`}
            style={{ fontFamily: "var(--font-display)" }}
          >
            {value}
          </p>
          {!unsupported && hasSparkline && (
            <div className="flex items-center gap-1">
              <MiniSparkline
                data={sparklineData ?? []}
                timestamps={sparklineTimestamps}
                color={sparklineColor ?? "#13d2e5"}
                height={22}
                width={64}
                valueLabel={sparklineValueLabel ?? "value"}
                valueSuffix={sparklineValueSuffix ?? ""}
              />
              {hasSparkline && (
                <button
                  type="button"
                  aria-label={`View ${label} trend details`}
                  title="View trend details"
                  className="touch-manipulation rounded-md p-1 text-slate-400 transition-colors hover:bg-brand-accent/10 hover:text-brand-deep active:bg-brand-accent/20 dark:text-slate-500"
                  onClick={(e) => {
                    e.stopPropagation();
                    setTrendOpen(true);
                  }}
                  data-testid={`button-sparkline-expand-${testIdSlug}`}
                >
                  <Maximize2 className="h-3 w-3" />
                </button>
              )}
            </div>
          )}
        </div>
        <p className="relative mt-0.5 text-[11px] leading-tight text-slate-500 dark:text-slate-400">{label}</p>
        {subtitle && <p className="relative mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">{subtitle}</p>}
        {deltaSlot && (
          <div className="relative mt-1" data-testid={`kpi-delta-${label.toLowerCase().replace(/\s+/g, "-")}`}>
            {deltaSlot}
          </div>
        )}
        {unsupported && (
          <div className="relative mt-auto pt-1.5">
            <StatusBadge status="disconnected" />
          </div>
        )}
      </div>
      {hasSparkline && (
        <SparklineDetailsDialog
          open={trendOpen}
          onOpenChange={setTrendOpen}
          label={label}
          data={sparklineData ?? []}
          timestamps={sparklineTimestamps}
          color={sparklineColor}
          valueLabel={sparklineValueLabel}
          valueSuffix={sparklineValueSuffix}
        />
      )}
    </>
  );
}
