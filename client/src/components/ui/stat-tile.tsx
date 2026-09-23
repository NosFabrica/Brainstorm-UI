import * as React from "react";
import { cn } from "@/lib/utils";
import { tone as resolveTone, type Tone } from "@/lib/tones";

// StatTile — the metric tile from the brand guidelines (p15 "UI Principles":
// icon + value + label, e.g. "People 1.2K"). A tinted icon chip over a value
// and caption, on the canonical card surface. Drives the admin / dashboard /
// network KPI tiles.
//
//   <StatTile icon={Users} value="1.2K" label="People" tone="brand" />

export interface StatTileProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ComponentType<{ className?: string }>;
  value: React.ReactNode;
  label: React.ReactNode;
  tone?: Tone;
  /** Optional slot rendered top-right (e.g. a delta Chip or sparkline). */
  aside?: React.ReactNode;
  /**
   * One line — tone dot, value, label — for a strip of counts that sits above
   * a list rather than being the page's subject. The icon and aside are not
   * rendered; there is no room for them, and the numbers are what the strip is.
   */
  compact?: boolean;
}

export function StatTile({ icon: Icon, value, label, tone = "brand", aside, compact = false, className, ...props }: StatTileProps) {
  const c = resolveTone(tone);
  if (compact) {
    return (
      <div
        className={cn(
          "inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-1.5",
          className,
        )}
        {...props}
      >
        <span className={cn("h-2 w-2 shrink-0 rounded-full", c.dot)} aria-hidden="true" />
        <span className="text-base font-semibold tabular-nums leading-none text-slate-900 dark:text-slate-100">{value}</span>
        <span className="text-xs text-slate-500 dark:text-slate-400">{label}</span>
      </div>
    );
  }
  return (
    <div
      className={cn(
        "rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5",
        className,
      )}
      {...props}
    >
      <div className="flex items-start justify-between gap-2">
        {Icon && (
          <span className={cn("flex h-9 w-9 items-center justify-center rounded-xl border", c.bg, c.border)}>
            <Icon className={cn("h-4 w-4", c.icon)} />
          </span>
        )}
        {aside && <div className="shrink-0">{aside}</div>}
      </div>
      <div className="mt-3 text-2xl font-bold tabular-nums tracking-tight text-slate-900 dark:text-slate-100">{value}</div>
      <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{label}</div>
    </div>
  );
}
