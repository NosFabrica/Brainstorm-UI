import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient, hasSessionToken } from "@/services/api";
import { getCurrentUser } from "@/services/nostr";

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
export function useScoringStatus(): {
  status: ScoringStatus;
  isCalculating: boolean;
  isReady: boolean;
  elapsedMs: number | null;
  triggeredAt: number;
  pubkey?: string;
} {
  const user = getCurrentUser();
  const enabled = hasSessionToken() && !!user?.pubkey;

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

  // Persist "scores are ready" from THIS app-wide poll (mounted globally via
  // ScoringStatusBar). The flag gates degree chips / the hops page everywhere;
  // previously only the dashboard set it, so after a fresh login the chips
  // stayed hidden until the user happened to visit /dashboard. Now they light
  // up within the first poll (~seconds) on whatever page the user is on.
  useEffect(() => {
    if (!publishDone) return;
    try {
      localStorage.setItem("brainstorm_calc_completed", "true");
      if (user?.pubkey) localStorage.setItem(`brainstorm_calc_completed:${user.pubkey}`, "true");
    } catch { /* ignore */ }
  }, [publishDone, user?.pubkey]);

  let triggeredAt = 0;
  try {
    triggeredAt = Number(localStorage.getItem(`brainstorm_calc_triggered_at:${user?.pubkey}`) || 0);
  } catch {
    /* ignore */
  }
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
