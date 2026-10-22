/**
 * The Growth tab: who's new and who's engaged in the dashboard's range, for
 * the team's glance and for outreach. Read off the year's run records
 * (growthCohorts) and the house lens's scores (services/wotRanks) — nothing
 * the backend and relays don't already serve. Admin-only, like the page.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { nip19 } from "nostr-tools";
import { Copy, Sparkles, UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatTile } from "@/components/ui/stat-tile";
import { copyToClipboard } from "@/lib/clipboard";
import { useToast } from "@/hooks/use-toast";
import { fetchAuthorRanks } from "@/services/wotRanks";
import { resolveHouseObserver } from "@/services/trustSource";
import type { AdminRange } from "@/pages/adminRange";
import { growthCohorts, type GrowthPerson, type RunRecord } from "./growthCohorts";

type Profile = { name?: string; picture?: string };

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
  // The system observer runs every period; it isn't a user.
  const observer = useQuery({ queryKey: ["house-observer"], queryFn: resolveHouseObserver, staleTime: Infinity });
  const cohorts = useMemo(
    () => growthCohorts(records, { range, now: Date.now(), exclude: observer.data ? [observer.data] : [] }),
    [records, range, observer.data],
  );
  const pubkeys = useMemo(() => cohorts.active.map((p) => p.pubkey), [cohorts]);
  const ranks = useQuery({
    queryKey: ["house-ranks", pubkeys],
    queryFn: () => fetchAuthorRanks(pubkeys, "house"),
    enabled: pubkeys.length > 0,
    staleTime: 300_000,
  });

  return (
    <div className="space-y-6" data-testid="card-growth">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile
          icon={UserPlus}
          value={cohorts.firstTime.length}
          label="First-time"
          tone="brand"
          data-testid="growth-first-time"
        />
        <StatTile
          icon={Sparkles}
          value={cohorts.selfCalculated.length}
          label="Self-calculated"
          tone="success"
          data-testid="growth-self-calculated"
        />
        <StatTile icon={Users} value={cohorts.activeCount} label="Active" data-testid="growth-active" />
      </div>
      <p className="text-[10px] text-slate-400 dark:text-slate-500">
        First-time: earliest run in the loaded year falls in the range (bulk-seeded accounts count the day they're
        seeded). Self-calculated: a run they triggered themselves — until the server stamps them apart, an admin's
        "Trigger recalculation" counts here too. Score: Brainstorm's own view, 0–100.
      </p>
      <PeopleList
        title="First-time"
        people={cohorts.firstTime}
        ranks={ranks.data?.ranks}
        profiles={profiles}
        isLoading={isLoading}
        testId="first-time"
      />
      <PeopleList
        title="Self-calculated"
        people={cohorts.selfCalculated}
        ranks={ranks.data?.ranks}
        profiles={profiles}
        isLoading={isLoading}
        testId="self-calculated"
      />
    </div>
  );
}

function PeopleList({
  title,
  people,
  ranks,
  profiles,
  isLoading,
  testId,
}: {
  title: string;
  people: GrowthPerson[];
  ranks: Map<string, number> | undefined;
  profiles: Map<string, Profile>;
  isLoading: boolean;
  testId: string;
}) {
  const { toast } = useToast();
  const copyNpubs = async () => {
    const ok = await copyToClipboard(people.map((p) => nip19.npubEncode(p.pubkey)).join("\n"), {});
    toast({ title: ok ? `Copied ${people.length} npub${people.length === 1 ? "" : "s"}` : "Couldn't copy" });
  };
  return (
    <div
      className="overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-sm dark:shadow-none"
      data-testid={`growth-list-${testId}`}
    >
      <div className="flex items-center justify-between gap-3 border-b border-brand-accent/10 px-4 py-3 sm:px-5">
        <h3
          className="text-sm font-bold text-slate-900 dark:text-slate-100"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {title} · {people.length}
        </h3>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={copyNpubs}
          disabled={people.length === 0}
          data-testid="button-copy-npubs"
        >
          <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy npubs
        </Button>
      </div>
      {isLoading && people.length === 0 ? (
        <p className="px-5 py-6 text-xs text-slate-500">Loading the year's runs…</p>
      ) : people.length === 0 ? (
        <p className="px-5 py-6 text-xs text-slate-500">No one in this range.</p>
      ) : (
        <table className="w-full text-xs">
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
              const rank = ranks?.get(p.pubkey);
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
                  <td className="px-3 py-2 text-right tabular-nums">{p.runs}</td>
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
