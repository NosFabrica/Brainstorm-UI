import { useEffect, useRef } from "react";
import { hasSessionToken } from "@/services/api";
import { getCurrentUser, triggerScoringAndAnchor } from "@/services/nostr";
import { knownFollowCount } from "@/lib/followStore";
import { useSelfHistory } from "@/hooks/useSelf";

/**
 * Returning users who ALREADY follow people but have never been scored (e.g. an
 * account that lived in another Nostr client) won't trigger GrapeRank through any
 * onboarding step — onboarding only fires scoring when you follow someone *here*.
 * This kicks the calculation once, in the background, so their trust scores
 * populate without a forced /activate detour. New in-app accounts (still on their
 * created-in-app marker) and no-follows users are intentionally skipped — they're
 * handled by the follow flow + the home-page "switch on your scores" nudge.
 *
 * Renders nothing; mount once at the app root.
 */
export function AutoScoreReturning() {
  const user = getCurrentUser();
  const pk = hasSessionToken() ? user?.pubkey : undefined;
  // Only decide once the /user/history query has actually settled, so we never
  // mistake "still loading" for "unscored".
  const history = useSelfHistory(pk);
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current || !pk || !history.isSuccess) return;

    const scored = !!(history.data as { data?: { ta_pubkey?: string | null } } | undefined)?.data?.ta_pubkey;
    if (scored) return; // already has a Web of Trust

    let createdInApp = false;
    let recentlyTriggered = false;
    try {
      createdInApp = localStorage.getItem(`brainstorm_created_inapp:${pk}`) === "true";
      const at = Number(localStorage.getItem(`brainstorm_calc_triggered_at:${pk}`) || 0);
      recentlyTriggered = at > 0 && Date.now() - at < 30 * 60_000;
    } catch { /* ignore */ }
    if (createdInApp || recentlyTriggered) return; // first-timer / just-triggered
    if (knownFollowCount(pk) < 1) return; // no follows → the home-page nudge handles it

    fired.current = true;
    void triggerScoringAndAnchor(pk);
  }, [pk, history.isSuccess, history.data]);

  return null;
}
