import { ChevronUp, ChevronDown, Minus } from "lucide-react";

export function DeltaIndicator({
  delta,
  suffix = "",
  inverted = false,
  label = "vs 24h ago",
  insufficient,
  insufficientLabel,
}: {
  delta: number | null;
  suffix?: string;
  inverted?: boolean;
  label?: string;
  insufficient?: boolean;
  insufficientLabel?: string;
}) {
  if (insufficient || delta === null || delta === undefined || Number.isNaN(delta)) {
    return (
      <span
        className="inline-flex items-center gap-0.5 text-[10px] font-medium text-slate-400 dark:text-slate-500"
        title={insufficientLabel ?? "Not enough historical data yet to compute a trend"}
      >
        <Minus className="h-3 w-3" /> {insufficientLabel ?? "—"}
      </span>
    );
  }
  const flat = delta === 0;
  const goodWhenUp = !inverted;
  const isGood = flat ? false : delta > 0 ? goodWhenUp : !goodWhenUp;
  const colorCls = flat ? "text-slate-400 dark:text-slate-500" : isGood ? "text-emerald-600" : "text-red-500";
  const Icon = flat ? Minus : delta > 0 ? ChevronUp : ChevronDown;
  const sign = delta > 0 ? "+" : "";
  return (
    <span className={`inline-flex items-center gap-0.5 whitespace-nowrap text-[10px] font-semibold ${colorCls}`}>
      <Icon className="h-3 w-3" />
      {sign}
      {delta}
      {suffix} <span className="ml-0.5 font-normal text-slate-400 dark:text-slate-500">{label}</span>
    </span>
  );
}
