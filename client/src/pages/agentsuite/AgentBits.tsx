import { Minus, TrendingDown, TrendingUp } from "lucide-react";

/** Up, down or flat against the score this device saw last time. */
export function TrendIndicator({ current, previous }: { current: number; previous: number | null }) {
  if (previous === null) return <Minus className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />;
  const diff = current - previous;
  if (Math.abs(diff) < 0.001) return <Minus className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />;
  if (diff > 0) return <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />;
  return <TrendingDown className="h-3.5 w-3.5 text-red-500" />;
}

/** The five lit-up steps from Dormant to Trusted. */
export function StatusLevelBar({ currentLevel }: { currentLevel: number }) {
  const levels = ["Dormant", "Active", "Established", "Networked", "Trusted"];
  return (
    <div className="flex w-full items-center gap-1" data-testid="agent-status-bar">
      {levels.map((label, i) => (
        <div key={label} className="flex flex-1 flex-col items-center gap-1">
          <div
            className={`h-1.5 w-full rounded-full transition-all duration-700 ${i <= currentLevel ? "bg-gradient-to-r from-emerald-400 to-brand-accent shadow-[0_0_8px_rgba(52,211,153,0.4)]" : "bg-white/10"}`}
          />
          <span
            className={`text-[8px] font-bold uppercase tracking-widest transition-colors ${i <= currentLevel ? "text-emerald-300" : "text-white/20"}`}
          >
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}
