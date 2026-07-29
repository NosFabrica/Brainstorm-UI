import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Users, UserPlus, Award, Network, ChevronRight, Loader2 } from "lucide-react";
import { BrainLogo } from "@/components/BrainLogo";

type HealthSlice = { name: string; value: number; color: string };

/**
 * "Your Network" — the condensed network card that replaces the old trio of
 * Social Graph + Extended Reach + Network Health tiles. One box, three compact
 * sections: verified follower/following counts, extended reach (with the hop
 * slider), and a slim trust-health bar. The full health pie + tier drill-downs
 * now live on /network; this is the dashboard summary.
 */
export function YourNetworkCard({
  isReady,
  loading,
  followers,
  following,
  extendedCount,
  hopRange,
  maxHop,
  onHopChange,
  health,
  onNavigate,
  wide = false,
}: {
  isReady: boolean;
  loading: boolean;
  followers: number;
  following: number;
  extendedCount: number;
  hopRange: number[];
  maxHop: number;
  onHopChange: (v: number[]) => void;
  health: HealthSlice[];
  onNavigate: (path: string) => void;
  /** Full-width layout: the three sections sit side by side instead of stacked. */
  wide?: boolean;
}) {
  const segments = health.filter((s) => s.value > 0);
  const total = segments.reduce((acc, s) => acc + s.value, 0);
  const statValue = (v: number) => (loading || !isReady ? <BrainLogo size={18} className="animate-pulse text-brand-link" /> : v.toLocaleString());

  const statTile = (label: string, value: number, icon: React.ReactNode, group: string) => (
    <div
      className={`relative flex h-full flex-col rounded-xl border bg-gradient-to-br from-white via-white to-brand-primary/[0.06] dark:from-slate-900 dark:via-slate-900 dark:to-brand-primary/[0.12] p-3 transition-all duration-300 overflow-hidden ${isReady ? "cursor-pointer border-slate-200/80 dark:border-slate-800/80 hover:border-brand-accent/40 hover:shadow-[0_8px_24px_-8px_rgb(var(--brand-accent)/0.2)] hover:-translate-y-0.5" : "border-slate-100 dark:border-slate-800/60"}`}
      onClick={() => isReady && onNavigate(`/network?group=${group}&view=list`)}
      role={isReady ? "button" : undefined}
      tabIndex={isReady ? 0 : -1}
      onKeyDown={(e) => { if (isReady && (e.key === "Enter" || e.key === " ")) onNavigate(`/network?group=${group}&view=list`); }}
      data-testid={`your-network-${group}`}
    >
      <div className="flex items-center gap-1.5 mb-2">
        <div className="p-1 rounded-md bg-brand-deep/8 text-brand-deep">{icon}</div>
        <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 font-mono tracking-tight leading-none">{statValue(value)}</div>
      {isReady && (
        <div className="mt-auto pt-2 flex items-center gap-1 text-[10px] font-semibold text-brand-deep/60"><span>Explore</span><ChevronRight className="h-2.5 w-2.5" /></div>
      )}
    </div>
  );

  return (
    <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm rounded-xl p-4 flex flex-col gap-3 h-full w-full relative" data-testid="card-your-network">
      {!isReady && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center rounded-xl bg-white/60 dark:bg-slate-900/60 backdrop-blur-[1px]" data-testid="your-network-locked">
          <Loader2 className="mb-2 h-5 w-5 animate-spin text-slate-400 dark:text-slate-500" />
          <span className="text-xs font-semibold tracking-wide text-slate-500 dark:text-slate-400">Scores calculating…</span>
        </div>
      )}
      <div className={`${!isReady ? "opacity-30 pointer-events-none select-none " : ""}flex flex-col gap-3`}>
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-800/60 shadow-sm text-brand-deep ring-1 ring-slate-100 dark:ring-slate-800">
            <Users className="h-3.5 w-3.5" />
          </div>
          <span className="text-sm font-bold text-slate-800 dark:text-slate-200 tracking-tight" style={{ fontFamily: "var(--font-display)" }}>Your Network</span>
          <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] font-mono text-slate-500 dark:text-slate-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Live
          </span>
        </div>

        {/* Wide (all-clear) → four equal cells on one row. `contents` dissolves
            the followers/following wrapper so its two tiles join the same 4-col
            grid, and items-stretch makes every box share one height. */}
        <div className={wide ? "grid gap-3 lg:grid-cols-4 lg:items-stretch" : "flex flex-col gap-3"}>
        {/* Social graph */}
        <div className={wide ? "contents" : "grid grid-cols-2 gap-2"}>
          {statTile("Followers", followers, <Award className="h-3 w-3" />, "followed_by")}
          {statTile("Following", following, <UserPlus className="h-3 w-3" />, "following")}
        </div>

        {/* Extended reach + hop slider */}
        <div className="flex h-full flex-col rounded-lg border border-slate-100 dark:border-slate-800/60 bg-slate-50/80 dark:bg-slate-900/80 p-2.5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider"><Network className="h-3 w-3" /> Extended reach</span>
            <span className="text-sm font-bold font-mono text-slate-900 dark:text-slate-100">{loading || !isReady ? "—" : extendedCount.toLocaleString()}</span>
          </div>
          {/* Fixed-height band centres the slider track so it lands on the exact
              same line as the trust-health bar in the box beside it. */}
          <div className="flex h-5 items-center">
            <Slider
              value={hopRange}
              onValueChange={(v) => {
                if (!isReady) return;
                const next = (v ?? [1, maxHop]).slice(0, 2) as number[];
                const lo = Math.min(next[0] ?? 1, next[1] ?? 1);
                const hi = Math.min(maxHop, Math.max(next[0] ?? 1, next[1] ?? 1));
                onHopChange([lo, hi]);
              }}
              max={maxHop}
              min={1}
              step={1}
              disabled={!isReady}
              className={isReady ? "cursor-pointer w-full" : "cursor-not-allowed w-full opacity-50"}
            />
          </div>
          <div className="flex justify-between text-[10px] uppercase tracking-wider font-semibold text-slate-400 dark:text-slate-500">
            <span>Direct</span>
            <span className="text-brand-primary dark:text-brand-link">{hopRange[0] === hopRange[1] ? `${hopRange[0]}` : `${hopRange[0]}–${hopRange[1]}`} hops</span>
            <span>Global</span>
          </div>
        </div>

        {/* Trust health — compact stacked bar + legend, full detail on /network.
            Same boxed chrome as Extended Reach so the two align on one baseline
            when the card goes wide. */}
        <div className="flex h-full flex-col rounded-lg border border-slate-100 dark:border-slate-800/60 bg-slate-50/80 dark:bg-slate-900/80 p-2.5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Trust health</span>
            <button type="button" onClick={() => onNavigate("/network")} className="text-[11px] font-semibold text-brand-link hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 rounded" data-testid="your-network-health-details">
              Details →
            </button>
          </div>
          {/* Same 20px band + 1.5 bar height as the slider so both sit on one line. */}
          <div className="flex h-5 items-center">
            <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" data-testid="your-network-health-bar">
              {total > 0 && segments.map((s, i) => (
                <div key={i} className="h-full first:rounded-l-full last:rounded-r-full" style={{ width: `${(s.value / total) * 100}%`, backgroundColor: isReady ? s.color : "#cbd5e1" }} title={`${s.name}: ${s.value.toLocaleString()}`} />
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5">
            {segments.slice(0, 4).map((s, i) => (
              <span key={i} className="inline-flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
                {s.name} <span className="font-mono text-slate-400 dark:text-slate-500">{total > 0 ? `${Math.round((s.value / total) * 100)}%` : "—"}</span>
              </span>
            ))}
          </div>
        </div>
        </div>
      </div>
    </Card>
  );
}
