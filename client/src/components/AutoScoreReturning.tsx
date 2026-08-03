import { useEffect, useRef } from "react";
import { hasSessionToken } from "@/services/api";
import { triggerScoringAndAnchor } from "@/services/nostr";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
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
/** Per-account marker: this account has had its one automatic scoring kick. */
const AUTO_KICK_KEY = (pk: string) => `brainstorm_auto_score_kicked:${pk}`;

export function AutoScoreReturning() {
  const user = useActiveAccountDisplay();
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

    // At most ONE automatic kick per account, ever.
    //
    // `scored` is the only durable guard, and it reads ta_pubkey — which stays null
    // if the Trusted Assertions publish never lands. When that happens the other
    // guard (recentlyTriggered) expires after 30 minutes, so EVERY app open past
    // that window silently enqueued another full network recalculation: the calc
    // ran, the "ready" nudge fired again, and dismissing it only lasted until the
    // next launch. Reported from an iOS PWA as the app re-announcing "your Web of
    // Trust is ready" on every open.
    //
    // An automatic retry loop is the wrong response to scoring not producing a
    // result anyway — it burns queue capacity for every affected user at once. One
    // attempt, then leave it to the explicit (and now confirmed) Recalculate.
    let alreadyKicked = false;
    try { alreadyKicked = localStorage.getItem(AUTO_KICK_KEY(pk)) === "true"; } catch { /* ignore */ }
    if (alreadyKicked) return;

    fired.current = true;
    try { localStorage.setItem(AUTO_KICK_KEY(pk), "true"); } catch { /* ignore */ }
    void triggerScoringAndAnchor(pk);
  }, [pk, history.isSuccess, history.data]);

  return null;
}
