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
  /** `manual` is a click — the person's own, or an admin's "Trigger
   *  recalculation", or the auto-run when an account is created; the server
   *  stamps them alike. `scheduled`/`periodic` are the cron jobs; `admin` is
   *  a resync. */
  trigger_source?: string | null;
};

export type GrowthPerson = {
  pubkey: string;
  firstRunMs: number;
  lastRunMs: number;
  /** Runs in the loaded year. */
  runs: number;
  /** Runs in the range the person triggered themselves — their first run
   *  aside, which is sign-up or seeding and stamped `manual` either way. */
  selfRuns: number;
  /** Runs in the range by the scheduler. */
  scheduledRuns: number;
};

export type GrowthCohorts = {
  /** First run ever falls in the range. */
  fresh: GrowthPerson[];
  /** Clicked Calculate themselves in the range, after their first run. */
  selfTriggered: GrowthPerson[];
  /** Ran in the range, but only by the scheduler. */
  scheduledOnly: GrowthPerson[];
  /** Ran before the range, not since. */
  dormant: GrowthPerson[];
  /** Any run in the range. */
  active: GrowthPerson[];
};

const runMs = (r: RunRecord): number => {
  const s = r.created_at;
  const t = new Date(s.endsWith("Z") ? s : s + "Z").getTime();
  return Number.isNaN(t) ? 0 : t;
};
const isScheduled = (source: string | null | undefined) => source === "scheduled" || source === "periodic";

export function growthCohorts(
  records: RunRecord[],
  { range, now, exclude }: { range: AdminRange; now: number; exclude: readonly string[] },
): GrowthCohorts {
  const { sinceMs } = rangeQuery(range, now);
  const skip = new Set(exclude);
  const runsOf = new Map<string, { t: number; source: string | null | undefined }[]>();
  for (const r of records) {
    const pubkey = r.pubkey;
    const t = runMs(r);
    if (!pubkey || !t || t > now || skip.has(pubkey)) continue;
    const list = runsOf.get(pubkey) ?? [];
    list.push({ t, source: r.trigger_source });
    runsOf.set(pubkey, list);
  }
  const people: GrowthPerson[] = [];
  for (const [pubkey, runs] of runsOf) {
    runs.sort((a, b) => a.t - b.t);
    const first = runs[0];
    const inRange = runs.filter((r) => r.t >= sinceMs);
    people.push({
      pubkey,
      firstRunMs: first.t,
      lastRunMs: runs[runs.length - 1].t,
      runs: runs.length,
      selfRuns: inRange.filter((r) => r !== first && (r.source ?? "manual") === "manual").length,
      scheduledRuns: inRange.filter((r) => isScheduled(r.source)).length,
    });
  }
  const newestFirst = (a: GrowthPerson, b: GrowthPerson) => b.lastRunMs - a.lastRunMs;
  people.sort(newestFirst);
  const active = people.filter((p) => p.lastRunMs >= sinceMs);
  return {
    fresh: active.filter((p) => p.firstRunMs >= sinceMs),
    selfTriggered: active.filter((p) => p.selfRuns > 0),
    scheduledOnly: active.filter((p) => p.selfRuns === 0 && p.scheduledRuns > 0),
    dormant: people.filter((p) => p.lastRunMs < sinceMs),
    active,
  };
}
