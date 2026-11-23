import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { accountKey } from "@/lib/accountStorage";
import { useHasSession } from "@/hooks/useHasSession";
import { markOwnScores } from "@/lib/ownScores";
import { grapeRankPollMs, grapeRankResultOptions, invalidateOwnScoreReads } from "@/services/queries/graperank";
import { overviewOptions } from "@/services/queries/userReads";

export type ScoringStatus = "idle" | "calculating" | "publishing" | "ready" | "failed";

const isDone = (s: unknown) => typeof s === "string" && s.toLowerCase() === "success";
const isFail = (s: unknown) => typeof s === "string" && s.toLowerCase() === "failure";

type GrapeRankResult = { data?: { internal_publication_status?: unknown; ta_status?: unknown; status?: unknown } };

/**
 * Whether each Account's last seen run had finished calculating. Module-level
 * because more than one component reads this hook (the pill and setup): each
 * would see the same transition, and two invalidations in one tick cancel and
 * restart the same fetches.
 */
const lastCalcDone = new Map<string, boolean>();

/** Test seam. */
export function __resetScoringTransitions(): void {
  lastCalcDone.clear();
}

/** When this Account last asked for a calculation, from its own marker (0 when never). */
function readTriggeredAt(pubkey: string | undefined): number {
  try {
    return Number(localStorage.getItem(accountKey("brainstorm_calc_triggered_at", pubkey ?? "")) || 0);
  } catch {
    return 0;
  }
}

/**
 * App-wide Web-of-Trust scoring status for the logged-in user, derived from
 * `/user/graperankResult` (+ the trust anchor via `useHasMywot`) plus a local
 * "just triggered" marker so the UI can show "Calculating…" the instant a calc
 * starts. Used by the global status chip (and any surface that wants to reflect
 * whether scores are computing / ready). The one poller of
 * `/user/graperankResult` (services/queries/graperank): every page reading the
 * run shares the entry and sees each poll land.
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

  const q = useQuery({
    ...grapeRankResultOptions(),
    enabled,
    // Only while a run is in flight, or was just asked for and hasn't shown up.
    refetchInterval: (query) => grapeRankPollMs(query.state.data, readTriggeredAt(user?.pubkey)),
  });

  const d = (q.data as GrapeRankResult | undefined)?.data;
  const calcDone = isDone(d?.internal_publication_status);
  const publishDone = calcDone && isDone(d?.ta_status);
  const failed = isFail(d?.status);

  // Persist "scores are ready" from THIS app-wide poll (mounted globally via
  // ScoringStatusBar). The flag gates degree chips / the hops page everywhere;
  // previously only the dashboard set it, so after a fresh login the chips
  // stayed hidden until the user happened to visit /dashboard. Now they light
  // up within the first poll (~seconds) on whatever page the user is on.
  useEffect(() => {
    if (!publishDone) return;
    markOwnScores(user?.pubkey);
  }, [publishDone, user?.pubkey]);

  // A calculation finishing changes the reader's own numbers, so their reads
  // refetch — once, on the real transition. The first answer is not one: a run
  // already finished when the page loaded (or restored from the device) has
  // nothing new to say, and treating it as news refetched the dashboard's
  // reads on every visit, cancelling the ones already in flight.
  const queryClient = useQueryClient();
  const answered = q.data !== undefined;
  useEffect(() => {
    const pk = user?.pubkey;
    if (!pk || !answered) return;
    const before = lastCalcDone.get(pk);
    lastCalcDone.set(pk, calcDone);
    if (before === false && calcDone) invalidateOwnScoreReads(queryClient, pk);
  }, [calcDone, answered, user?.pubkey, queryClient]);

  // The Dashboard is a lazy chunk, and its first read is the reader's own
  // overview — which used to wait for the chunk to download before it was
  // even asked. This hook runs at the App root from boot and from the moment
  // of sign-in, so it asks then; the page finds it in hand (or in flight).
  const pk = user?.pubkey;
  useEffect(() => {
    if (!enabled || !pk) return;
    void queryClient.prefetchQuery(overviewOptions(pk, "viewer")).catch(() => undefined);
  }, [enabled, pk, queryClient]);

  const triggeredAt = readTriggeredAt(user?.pubkey);
  const triggeredRecently = triggeredAt > 0 && Date.now() - triggeredAt < 30 * 60_000;
  const elapsedMs = triggeredAt > 0 ? Date.now() - triggeredAt : null;

  // "Ready" must mean the backend genuinely finished AND published the scores
  // (what actually populates the dashboard). The mere existence of a trust
  // anchor (hasMywot) is too weak — it stays true across sessions and fires a
  // false "ready" with an empty dashboard, so it's intentionally NOT used here.
  let status: ScoringStatus = "idle";
  if (!enabled) status = "idle";
  else if (publishDone) status = "ready";
  else if (failed) status = "failed";
  else if (calcDone) status = "publishing";
  else if (d || triggeredRecently) status = "calculating";

  return {
    status,
    isCalculating: status === "calculating" || status === "publishing",
    isReady: status === "ready",
    elapsedMs,
    triggeredAt,
    pubkey: user?.pubkey,
  };
}
