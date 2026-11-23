/**
 * `GET /user/graperankResult` — the signed-in reader's latest GrapeRank run —
 * read by six pages and the app-wide status pill, and polled by exactly one of
 * them.
 *
 * Every reader used to bring its own timer: the pill every 20 s even with no
 * run at all (forever, for anyone who never calculated), the Dashboard every
 * 60 s for 25 minutes after a run had finished, Insights every 15 s, and four
 * pages a 30 s staleTime that refetched on each visit. react-query times each
 * observer on its own, so those added up. Now the pill
 * (hooks/useScoringStatus, mounted at the App root) is the only poller, and
 * only while a run is in flight or was just asked for; every page reads the
 * same entry and sees each poll land.
 */
import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { apiClient } from "@/services/api";
import { runOf } from "@/lib/graperankRun";
import { HISTORY_BASE, INFLUENCE_BASE, OVERVIEW_BASE, STATS_BASE } from "@/services/queries/userReads";

export const GRAPERANK_RESULT_KEY = ["/user/graperankResult"] as const;

/** How often the pill asks while a run is in flight. */
export const IN_FLIGHT_POLL_MS = 15_000;
/** …and while a run was asked for but the server has no record of it yet. */
export const AWAITING_RUN_POLL_MS = 20_000;
/** How long a trigger keeps that second poll going before giving up on it. */
export const TRIGGER_WINDOW_MS = 30 * 60_000;
/** Server timestamps are a clock apart from ours. */
const CLOCK_SKEW_MS = 60_000;

export function grapeRankResultOptions() {
  return queryOptions({
    queryKey: GRAPERANK_RESULT_KEY,
    queryFn: () => apiClient.getGrapeRankResult(),
    // Fresh for a while: the poll below is what follows a run, so a page
    // visit only needs to ask when nobody has for some minutes.
    staleTime: 5 * 60_000,
    retry: false,
  });
}

type Run = {
  status?: unknown;
  internal_publication_status?: unknown;
  ta_status?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
};

const isDone = (s: unknown) => typeof s === "string" && s.toLowerCase() === "success";
const isFail = (s: unknown) => typeof s === "string" && s.toLowerCase() === "failure";

/** Finished one way or another: calculated and published, or failed at either step. */
export function runSettled(run: Run): boolean {
  if (isFail(run.status) || isFail(run.internal_publication_status)) return true;
  return isDone(run.internal_publication_status) && (isDone(run.ta_status) || isFail(run.ta_status));
}

/** The server's naive-UTC timestamps, as ours. */
function serverMs(value: unknown): number | null {
  if (typeof value !== "string" || !value) return null;
  const ms = Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : `${value}Z`);
  return Number.isFinite(ms) ? ms : null;
}

let lastTriggeredAt = 0;

/**
 * A Recalculate was just pressed. Until a run newer than that shows up, the
 * pill keeps asking — the trigger's own answer usually carries the new run,
 * but when it doesn't, the cached one is the previous, finished run, which
 * on its own would stop the poll before the new one was ever seen.
 */
export function noteGrapeRankTriggered(at: number = Date.now()): void {
  lastTriggeredAt = Math.max(lastTriggeredAt, at);
}

/** Test seam. */
export function __resetGrapeRankTrigger(): void {
  lastTriggeredAt = 0;
}

/**
 * The poll interval for the pill: in flight → every 15 s; asked for and not
 * seen yet → every 20 s for up to half an hour; otherwise nothing. No run and
 * no trigger is the common case — a reader who never calculated — and asks
 * nothing at all.
 */
export function grapeRankPollMs(data: unknown, storedTriggeredAt: number, now: number = Date.now()): number | false {
  const run = runOf<Run>(data);
  if (run && !runSettled(run)) return IN_FLIGHT_POLL_MS;
  const triggeredAt = Math.max(storedTriggeredAt, lastTriggeredAt);
  if (!triggeredAt || now - triggeredAt >= TRIGGER_WINDOW_MS) return false;
  if (run) {
    const at = serverMs(run.updated_at) ?? serverMs(run.created_at);
    // A settled run with no timestamps can't be placed; stop rather than guess for half an hour.
    if (at === null || at >= triggeredAt - CLOCK_SKEW_MS) return false;
  }
  return AWAITING_RUN_POLL_MS;
}

/**
 * A calculation just finished: what it changed is the reader's own standing —
 * their overview, influence and stats (both perspectives), their history ("last
 * calculated") and their network's alerts. Other people's cached reads did not
 * move, and invalidating every `/user/overview` used to refetch each one a
 * page had open.
 */
export function invalidateOwnScoreReads(queryClient: QueryClient, pubkey: string): void {
  for (const base of [OVERVIEW_BASE, INFLUENCE_BASE, STATS_BASE, HISTORY_BASE, "/networkAlerts"]) {
    void queryClient.invalidateQueries({ queryKey: [base, pubkey] });
  }
}
