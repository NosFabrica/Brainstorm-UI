import { useMemo, useState } from "react";
import { Network } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { ladderFor } from "@/lib/trustLadder";
import { healthByHops, maxHopOf, reachByHops, type CountValues } from "@/lib/networkReach";

/**
 * Reach and health, above the Network page's filters: how many people the
 * reader's run reached within a hop range, and how that reach splits into
 * verified, unknown and flagged. The slider only moves the range the two
 * numbers describe; the list below is not filtered by hops (the API has no
 * such filter yet).
 *
 * This is where the dashboard's "Your Network" card went when the dashboard
 * became a search page. The card's invented fallback numbers did not come
 * with it: without a run the strip shows dashes.
 */
export function NetworkReachStrip({
  counts,
  loading,
  onDetails,
}: {
  counts: CountValues | null;
  loading: boolean;
  onDetails: () => void;
}) {
  const maxHop = counts ? maxHopOf(counts) : 1;
  const [range, setRange] = useState<[number, number]>([1, 3]);
  const lo = Math.min(range[0], maxHop);
  const hi = Math.min(range[1], maxHop);

  const reach = counts ? reachByHops(counts, lo, hi) : null;
  const health = useMemo(() => {
    const ladder = ladderFor("simple");
    const rung = (key: "verified" | "unknown" | "flagged") => ladder.find((r) => r.key === key)!;
    const split = counts ? healthByHops(counts, lo, hi) : null;
    return (["verified", "unknown", "flagged"] as const).map((key) => ({
      key,
      label: rung(key).label,
      color: rung(key).color,
      value: split ? split[key] : null,
    }));
  }, [counts, lo, hi]);
  const total = health.reduce((n, s) => n + (s.value ?? 0), 0);
  const ready = !loading && counts !== null;

  const box =
    "flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900";
  const label =
    "inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400";

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" data-testid="network-reach-strip">
      <div className={box}>
        <div className="flex items-center justify-between">
          <span className={label}>
            <Network className="h-3 w-3" /> Extended reach
          </span>
          <span
            className="font-mono text-sm font-bold text-slate-900 dark:text-slate-100"
            data-testid="network-reach-count"
          >
            {reach === null ? "—" : reach.toLocaleString()}
          </span>
        </div>
        <div className="flex h-5 items-center">
          <Slider
            value={[lo, hi]}
            onValueChange={(v) => {
              if (!ready) return;
              const next = (v ?? [1, maxHop]).slice(0, 2);
              const a = Math.min(next[0] ?? 1, next[1] ?? 1);
              const b = Math.min(maxHop, Math.max(next[0] ?? 1, next[1] ?? 1));
              setRange([a, b]);
            }}
            min={1}
            max={Math.max(maxHop, 2)}
            step={1}
            disabled={!ready}
            aria-label="Hop range"
            className={ready ? "w-full cursor-pointer" : "w-full cursor-not-allowed opacity-50"}
          />
        </div>
        <div className="flex justify-between text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
          <span>Direct</span>
          <span className="text-brand-primary dark:text-brand-link" data-testid="network-reach-hops">
            {lo === hi ? `${lo}` : `${lo}–${hi}`} hops
          </span>
          <span>Global</span>
        </div>
      </div>

      <div className={box}>
        <div className="flex items-center justify-between">
          <span className={label}>Trust health</span>
          <button
            type="button"
            onClick={onDetails}
            className="rounded text-[11px] font-semibold text-brand-link hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40"
            data-testid="network-health-details"
          >
            Details →
          </button>
        </div>
        <div className="flex h-5 items-center">
          <div
            className="flex h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
            data-testid="network-health-bar"
          >
            {total > 0 &&
              health.map((s) => (
                <div
                  key={s.key}
                  className="h-full first:rounded-l-full last:rounded-r-full"
                  style={{ width: `${((s.value ?? 0) / total) * 100}%`, backgroundColor: s.color }}
                  title={`${s.label}: ${(s.value ?? 0).toLocaleString()}`}
                  data-testid="network-health-segment"
                />
              ))}
          </div>
        </div>
        {/* Every rung, even at 0% — a legend missing a tier reads as broken. */}
        <div className="flex flex-wrap gap-x-3 gap-y-0.5" data-testid="network-health-legend">
          {health.map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
              {s.label}{" "}
              <span className="font-mono text-slate-400 dark:text-slate-500">
                {s.value === null || total === 0 ? "—" : `${Math.round((s.value / total) * 100)}%`}
              </span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
