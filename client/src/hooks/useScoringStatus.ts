import { useQuery } from "@tanstack/react-query";
import { apiClient, hasSessionToken } from "@/services/api";
import { getCurrentUser } from "@/services/nostr";
import { useHasMywot } from "@/hooks/useHasMywot";

export type ScoringStatus = "idle" | "calculating" | "publishing" | "ready" | "failed";

const isDone = (s: unknown) => typeof s === "string" && s.toLowerCase() === "success";
const isFail = (s: unknown) => typeof s === "string" && s.toLowerCase() === "failure";

/**
 * App-wide Web-of-Trust scoring status for the logged-in user, derived from
 * `/user/graperankResult` (+ the trust anchor via `useHasMywot`) plus a local
 * "just triggered" marker so the UI can show "Calculating…" the instant a calc
 * starts. Used by the global status chip (and any surface that wants to reflect
 * whether scores are computing / ready). Shares the `/user/graperankResult`
 * query key with the dashboard so there's a single poll.
 */
export function useScoringStatus(): { status: ScoringStatus; isCalculating: boolean; isReady: boolean } {
  const user = getCurrentUser();
  const enabled = hasSessionToken() && !!user?.pubkey;
  const { hasMywot } = useHasMywot();

  const q = useQuery({
    queryKey: ["/user/graperankResult"],
    queryFn: () => apiClient.getGrapeRankResult(),
    enabled,
    staleTime: 10_000,
    refetchInterval: (query) => {
      const d = (query.state.data as any)?.data;
      if (!d) return 20_000;
      const done = isDone(d.internal_publication_status) && isDone(d.ta_status);
      return done || isFail(d.status) ? false : 15_000;
    },
  });

  const d = (q.data as any)?.data;
  const calcDone = isDone(d?.internal_publication_status);
  const publishDone = calcDone && isDone(d?.ta_status);
  const failed = isFail(d?.status);

  let triggeredRecently = false;
  try {
    const ts = Number(localStorage.getItem(`brainstorm_calc_triggered_at:${user?.pubkey}`) || 0);
    triggeredRecently = ts > 0 && Date.now() - ts < 30 * 60_000;
  } catch {
    /* ignore */
  }

  let status: ScoringStatus = "idle";
  if (!enabled) status = "idle";
  else if (hasMywot || publishDone) status = "ready";
  else if (failed) status = "failed";
  else if (calcDone) status = "publishing";
  else if (d || triggeredRecently) status = "calculating";

  return {
    status,
    isCalculating: status === "calculating" || status === "publishing",
    isReady: status === "ready",
  };
}
