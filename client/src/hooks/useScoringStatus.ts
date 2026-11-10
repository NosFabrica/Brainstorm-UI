import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/services/api";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { accountKey } from "@/lib/accountStorage";
import { useHasSession } from "@/hooks/useHasSession";
import { hasOwnScores, markOwnScores } from "@/lib/ownScores";

export type ScoringStatus = "idle" | "calculating" | "publishing" | "ready" | "failed";

const stage = (s: unknown) => (typeof s === "string" ? s.toLowerCase() : undefined);
const isDone = (s: unknown) => stage(s) === "success";
const isFail = (s: unknown) => stage(s) === "failure";
// The backend's own non-terminal vocabulary (`_NON_TERMINAL_STATUSES` in
// brainstorm_server's scheduler): a stage still waiting for, or doing, its work.
const isPending = (s: unknown) => stage(s) === "waiting" || stage(s) === "ongoing";

/** The fields of the latest run (`GET /user/graperankResult` → `.data`) this hook reads. */
export type GrapeRankRunStatus = {
  status?: unknown;
  internal_publication_status?: unknown;
  ta_status?: unknown;
  trigger_source?: unknown;
  created_at?: unknown;
};

type GrapeRankResult = { data?: GrapeRankRunStatus | null };

// Runs the backend starts on its own, on the account's refresh cadence.
const BACKGROUND_SOURCES = new Set(["scheduled", "periodic"]);

/**
 * Where scoring stands for this account, from its latest run.
 *
 * `/user/graperankResult` is the account's *latest* run, which is not always
 * the one the user is waiting on: the backend re-scores every account on a
 * cadence, and those scheduled runs can sit in the queue for hours behind
 * interactive ones. Reading every unfinished run as "calculating" kept the
 * "Calculating your network…" pill spinning for people whose scores had been
 * ready for hours — and, with no local trigger time to measure it against, it
 * never stood down either. So:
 *
 * - a run nobody on this device asked for (`triggeredRecently` false), for an
 *   account that already has scores or that the backend started itself, is a
 *   background refresh: the scores already there stay "ready", and a refresh
 *   that fails is not news;
 * - a run is "calculating" only while a stage is actually pending, as the
 *   backend defines it — a failed publication (`ta_status: failure`) is
 *   terminal, not "publishing" forever.
 */
export function scoringStatusOf(
  run: GrapeRankRunStatus | null | undefined,
  ctx: { triggeredRecently: boolean; hasScores: boolean },
): ScoringStatus {
  if (!run) return ctx.triggeredRecently ? "calculating" : "idle";

  const calcDone = isDone(run.internal_publication_status);
  if (calcDone && isDone(run.ta_status)) return "ready";

  const failed = isFail(run.status) || isFail(run.internal_publication_status) || isFail(run.ta_status);
  const pending =
    !failed &&
    (isPending(run.status) ||
      (isDone(run.status) && (isPending(run.internal_publication_status) || isPending(run.ta_status))));
  if (!failed && !pending) return ctx.hasScores ? "ready" : "idle";

  const background =
    !ctx.triggeredRecently && (ctx.hasScores || BACKGROUND_SOURCES.has(stage(run.trigger_source) ?? ""));
  if (background) return ctx.hasScores ? "ready" : "idle";

  if (failed) return "failed";
  return calcDone ? "publishing" : "calculating";
}

/** Epoch ms of a backend timestamp (naive UTC), or null. */
function serverMs(iso: unknown): number | null {
  if (typeof iso !== "string" || !iso) return null;
  const t = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : iso + "Z").getTime();
  return Number.isNaN(t) ? null : t;
}

/**
 * App-wide Web-of-Trust scoring status for the logged-in user, derived from
 * `/user/graperankResult` plus a local "just triggered" marker so the UI can
 * show "Calculating…" the instant a calc starts. Used by the global status chip
 * (and any surface that wants to reflect whether scores are computing / ready).
 * Shares the `/user/graperankResult` query key with the dashboard so there's a
 * single poll. See `scoringStatusOf` for which runs count.
 */
export function useScoringStatus(): {
  status: ScoringStatus;
  isCalculating: boolean;
  isReady: boolean;
  elapsedMs: number | null;
  triggeredAt: number;
  pubkey?: string;
} {
  const user = useActiveAccountDisplay();
  const hasSession = useHasSession();
  const enabled = hasSession && !!user?.pubkey;
  const pubkey = user?.pubkey;

  let triggeredAt = 0;
  try {
    triggeredAt = Number(localStorage.getItem(accountKey("brainstorm_calc_triggered_at", pubkey ?? "")) || 0);
  } catch {
    /* ignore */
  }
  const triggeredRecently = triggeredAt > 0 && Date.now() - triggeredAt < 30 * 60_000;

  const q = useQuery({
    queryKey: ["/user/graperankResult"],
    queryFn: () => apiClient.getGrapeRankResult(),
    enabled,
    staleTime: 10_000,
    refetchInterval: (query) => {
      const d = (query.state.data as GrapeRankResult | undefined)?.data;
      if (!d) return 20_000;
      const s = scoringStatusOf(d, { triggeredRecently, hasScores: hasOwnScores(pubkey) });
      if (s === "calculating" || s === "publishing") return 15_000;
      // Terminal, or a background refresh nobody is watching: no need to hammer it.
      return isDone(d.ta_status) || isFail(d.status) || isFail(d.ta_status) ? false : 60_000;
    },
  });

  const d = enabled ? (q.data as GrapeRankResult | undefined)?.data : undefined;
  const publishDone = isDone(d?.internal_publication_status) && isDone(d?.ta_status);

  // Persist "scores are ready" from THIS app-wide poll (mounted globally via
  // ScoringStatusBar). The flag gates degree chips / the hops page everywhere;
  // previously only the dashboard set it, so after a fresh login the chips
  // stayed hidden until the user happened to visit /dashboard. Now they light
  // up within the first poll (~seconds) on whatever page the user is on.
  useEffect(() => {
    if (!publishDone) return;
    markOwnScores(pubkey);
  }, [publishDone, pubkey]);

  // "Ready" must mean the backend genuinely finished AND published the scores
  // (what actually populates the dashboard). The mere existence of a trust
  // anchor (hasMywot) is too weak — it stays true across sessions and fires a
  // false "ready" with an empty dashboard, so it's intentionally NOT used here.
  const status: ScoringStatus = enabled
    ? scoringStatusOf(d, { triggeredRecently, hasScores: publishDone || hasOwnScores(pubkey) })
    : "idle";

  // How long this run has been going: since this device triggered it, else since
  // the backend created it — so a run started elsewhere still stands down after
  // STALL_MS instead of spinning for as long as it stays unfinished.
  const startedAt = triggeredAt > 0 ? triggeredAt : serverMs(d?.created_at);
  const elapsedMs = startedAt ? Math.max(0, Date.now() - startedAt) : null;

  return {
    status,
    isCalculating: status === "calculating" || status === "publishing",
    isReady: status === "ready",
    elapsedMs,
    triggeredAt,
    pubkey,
  };
}
