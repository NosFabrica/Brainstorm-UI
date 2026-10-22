/**
 * The Growth tab: who's new and who's engaged in the dashboard's range, for
 * the team's glance and for outreach. Four segments of the range's people
 * (growthCohorts) and one list beneath; scores from the house lens
 * (services/wotRanks). Nothing the backend and relays don't already serve.
 * Admin-only, like the page.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { nip19 } from "nostr-tools";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { copyToClipboard } from "@/lib/clipboard";
import { useToast } from "@/hooks/use-toast";
import { fetchAuthorRanks } from "@/services/wotRanks";
import { resolveHouseObserver } from "@/services/trustSource";
import type { AdminRange } from "@/pages/adminRange";
import { growthCohorts, type GrowthCohorts, type RunRecord } from "./growthCohorts";

type Profile = { name?: string; picture?: string };
type Segment = keyof Omit<GrowthCohorts, "active">;

/** Each segment, what it means, and the outreach it suggests. */
const SEGMENTS: { key: Segment; label: string; meaning: string }[] = [
  { key: "fresh", label: "New", meaning: "first run in this range — a welcome, and a check-in if they don't return" },
  {
    key: "selfTriggered",
    label: "Self-triggered",
    meaning: "came back and clicked Calculate themselves — the engaged; on Free, the ones to tell about Priority",
  },
  {
    key: "scheduledOnly",
    label: "Scheduled only",
    meaning: "ran in this range, but only by the scheduler — engaged by default, not by choice",
  },
  { key: "dormant", label: "Dormant", meaning: "ran before this range and not since — the ones to win back" },
];

export function GrowthCard({
  records,
  range,
  isLoading,
  profiles,
}: {
  records: RunRecord[];
  range: AdminRange;
  isLoading: boolean;
  profiles: Map<string, Profile>;
}) {
  const { toast } = useToast();
  const [segment, setSegment] = useState<Segment>("fresh");
  // The system observer runs every period; it isn't a user.
  const observer = useQuery({ queryKey: ["house-observer"], queryFn: resolveHouseObserver, staleTime: Infinity });
  const cohorts = useMemo(
    () => growthCohorts(records, { range, now: Date.now(), exclude: observer.data ? [observer.data] : [] }),
    [records, range, observer.data],
  );
  const people = cohorts[segment];
  const pubkeys = useMemo(() => people.map((p) => p.pubkey), [people]);
  const ranks = useQuery({
    queryKey: ["house-ranks", pubkeys],
    queryFn: () => fetchAuthorRanks(pubkeys, "house"),
    enabled: pubkeys.length > 0,
    staleTime: 300_000,
  });
  const meaning = SEGMENTS.find((s) => s.key === segment)!.meaning;

  const copyNpubs = async () => {
    const ok = await copyToClipboard(people.map((p) => nip19.npubEncode(p.pubkey)).join("\n"), {});
    toast({ title: ok ? `Copied ${people.length} npub${people.length === 1 ? "" : "s"}` : "Couldn't copy" });
  };

  return (
    <div
      className="overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-sm dark:shadow-none"
      data-testid="card-growth"
    >
      <div className="border-b border-brand-accent/10 px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div
            className="inline-flex flex-wrap gap-0.5 self-start rounded-lg border-2 border-brand-accent/40 bg-white p-1 shadow-sm dark:bg-slate-900"
            role="tablist"
            aria-label="Segment"
            data-testid="growth-segments"
          >
            {SEGMENTS.map((s) => (
              <button
                key={s.key}
                type="button"
                role="tab"
                aria-selected={segment === s.key}
                onClick={() => setSegment(s.key)}
                className={`cursor-pointer rounded-md px-3 py-1 text-[11px] font-bold transition-all active:scale-95 ${segment === s.key ? "bg-brand-primary text-white shadow-md ring-1 ring-brand-primary/[0.4]" : "bg-slate-50 text-slate-600 hover:bg-brand-accent/10 hover:text-brand-deep hover:shadow-sm dark:bg-slate-900 dark:text-slate-300"}`}
                data-testid={`growth-segment-${s.key}`}
              >
                {s.label} · {cohorts[s.key].length}
              </button>
            ))}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={copyNpubs}
            disabled={people.length === 0}
            data-testid="button-copy-npubs"
          >
            <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy {people.length} npub{people.length === 1 ? "" : "s"}
          </Button>
        </div>
        <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400" data-testid="growth-meaning">
          {meaning}. Runs: self is their own click after their first run (the first is sign-up or seeding — and an
          admin's "Trigger recalculation" still counts as self until the server stamps it apart). Score: Brainstorm's
          own view, 0–100.
        </p>
      </div>
      {isLoading && people.length === 0 ? (
        <p className="px-5 py-6 text-xs text-slate-500">Loading the year's runs…</p>
      ) : people.length === 0 ? (
        <p className="px-5 py-6 text-xs text-slate-500">No one in this range.</p>
      ) : (
        <table className="w-full text-xs" data-testid="growth-list">
          <thead className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
            <tr>
              <th className="px-4 py-2 text-left sm:px-5">Person</th>
              <th className="px-3 py-2 text-left">First run</th>
              <th className="px-3 py-2 text-left">Last run</th>
              <th className="px-3 py-2 text-right">Runs</th>
              <th className="px-4 py-2 text-right sm:px-5">Score</th>
            </tr>
          </thead>
          <tbody>
            {people.map((p) => {
              const npub = nip19.npubEncode(p.pubkey);
              const prof = profiles.get(p.pubkey);
              const rank = ranks.data?.ranks.get(p.pubkey);
              return (
                <tr key={p.pubkey} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-4 py-2 sm:px-5">
                    <div className="flex items-center gap-2">
                      {prof?.picture ? (
                        <img src={prof.picture} alt="" className="h-6 w-6 rounded-full object-cover" />
                      ) : (
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-500 dark:bg-slate-800">
                          {(prof?.name ?? npub.slice(5, 6)).slice(0, 1).toUpperCase()}
                        </span>
                      )}
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-slate-800 dark:text-slate-100">
                          {prof?.name ?? `${npub.slice(0, 12)}…`}
                        </span>
                        <span className="block font-mono text-[10px] text-slate-400">{npub.slice(0, 16)}…</span>
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2 tabular-nums text-slate-600 dark:text-slate-300">
                    {new Date(p.firstRunMs).toLocaleDateString()}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-slate-600 dark:text-slate-300">
                    {new Date(p.lastRunMs).toLocaleString([], {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums" data-testid={`growth-runs-${p.pubkey}`}>
                    <span className="font-semibold">{p.runs}</span>
                    <span className="block text-[10px] text-slate-400">
                      {p.selfRuns} self · {p.scheduledRuns} sched
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums sm:px-5" data-testid={`growth-score-${p.pubkey}`}>
                    {rank === undefined ? "—" : rank}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
