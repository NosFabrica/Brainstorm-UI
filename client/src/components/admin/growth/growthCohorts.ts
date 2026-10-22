/**
 * Who's new and who's engaged in the dashboard's range, read off the year's
 * run records (GET /admin/activity, `days` 365) — nothing the backend doesn't
 * already serve. A person's first run is their earliest record in that year.
 */
import { rangeQuery, type AdminRange } from "@/pages/adminRange";

export type RunRecord = {
  pubkey?: string | null;
  created_at: string;
  updated_at?: string;
  status?: string | null;
  /** `manual` is the person's own click (and, until the server stamps them
   *  `admin`, an admin's "Trigger recalculation"); `scheduled`/`periodic`
   *  are the cron jobs; `admin` is a resync. */
  trigger_source?: string | null;
};

export type GrowthPerson = {
  pubkey: string;
  firstRunMs: number;
  lastRunMs: number;
  /** Runs in the loaded year. */
  runs: number;
  /** Runs in the range the person triggered themselves. */
  selfRuns: number;
};

export type GrowthCohorts = {
  /** Earliest run ever falls in the range. */
  firstTime: GrowthPerson[];
  /** Triggered a run themselves in the range. */
  selfCalculated: GrowthPerson[];
  /** Any run in the range. */
  active: GrowthPerson[];
  activeCount: number;
};

const runMs = (r: RunRecord): number => {
  const s = r.created_at;
  const t = new Date(s.endsWith("Z") ? s : s + "Z").getTime();
  return Number.isNaN(t) ? 0 : t;
};

export function growthCohorts(
  records: RunRecord[],
  { range, now, exclude }: { range: AdminRange; now: number; exclude: readonly string[] },
): GrowthCohorts {
  const { sinceMs } = rangeQuery(range, now);
  const skip = new Set(exclude);
  const people = new Map<string, GrowthPerson>();
  const inRange = new Set<string>();
  for (const r of records) {
    const pubkey = r.pubkey;
    const t = runMs(r);
    if (!pubkey || !t || t > now || skip.has(pubkey)) continue;
    const p = people.get(pubkey) ?? { pubkey, firstRunMs: t, lastRunMs: t, runs: 0, selfRuns: 0 };
    p.firstRunMs = Math.min(p.firstRunMs, t);
    p.lastRunMs = Math.max(p.lastRunMs, t);
    p.runs += 1;
    if (t >= sinceMs) {
      inRange.add(pubkey);
      if ((r.trigger_source ?? "manual") === "manual") p.selfRuns += 1;
    }
    people.set(pubkey, p);
  }
  const newestFirst = (a: GrowthPerson, b: GrowthPerson) => b.lastRunMs - a.lastRunMs;
  const active = [...people.values()].filter((p) => inRange.has(p.pubkey)).sort(newestFirst);
  return {
    firstTime: active.filter((p) => p.firstRunMs >= sinceMs),
    selfCalculated: active.filter((p) => p.selfRuns > 0),
    active,
    activeCount: active.length,
  };
}
