import { useMemo, useState } from "react";
import { Slider } from "@/components/ui/slider";
import { ladderFor } from "@/lib/trustLadder";
import { healthByHops, maxHopOf, reachByHops, type CountValues } from "@/lib/networkReach";

/**
 * One status line under the Network page's title: how many people the
 * reader's run reached within a hop range, and how that reach splits into
 * verified, unknown and flagged. It sits with "Scores from your perspective"
 * because it is about the same thing — what those scores add up to — and not
 * inside the filter card, because nothing here filters the list (the API has
 * no hops filter; the slider only moves the range the number describes).
 *
 * This is where the dashboard's "Your Network" card went when the dashboard
 * became a search page. The card's invented fallback numbers did not come
 * with it: without a run the line shows dashes. The slider is a tablet-and-up
 * nicety; on a phone the line is a number and a bar.
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

  return (
    <div
      className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-600 dark:text-slate-300"
      data-testid="network-reach-strip"
    >
      {/* Reach: the number, the range it covers, and (from sm) the control that moves the range. */}
      <div className="flex min-w-0 items-center gap-2">
        <span
          className="font-mono text-base font-bold tabular-nums text-slate-900 dark:text-slate-100"
          data-testid="network-reach-count"
        >
          {reach === null ? "—" : reach.toLocaleString()}
        </span>
        <span>
          people within{" "}
          <span className="font-medium text-brand-primary dark:text-brand-link" data-testid="network-reach-hops">
            {reach === null ? "— hops" : lo === hi ? `${lo} hop${lo === 1 ? "" : "s"}` : `${lo}–${hi} hops`}
          </span>
        </span>
        <span className="hidden w-28 items-center sm:flex" data-testid="network-reach-slider">
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
        </span>
      </div>

      {/* Health: the bar and its legend, every rung even at 0% — a legend missing a tier reads as broken. */}
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
        <div
          className="flex h-1.5 w-32 overflow-hidden rounded-full bg-slate-200/70 dark:bg-slate-800 sm:w-44"
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
        <span className="flex flex-wrap gap-x-2.5 gap-y-0.5 text-xs" data-testid="network-health-legend">
          {health.map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} aria-hidden="true" />
              {s.label}{" "}
              <span className="font-mono text-slate-400 dark:text-slate-500">
                {s.value === null || total === 0 ? "—" : `${Math.round((s.value / total) * 100)}%`}
              </span>
            </span>
          ))}
        </span>
        <button
          type="button"
          onClick={onDetails}
          className="rounded text-xs font-medium text-brand-link hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40"
          data-testid="network-health-details"
        >
          Details →
        </button>
      </div>
    </div>
  );
}
