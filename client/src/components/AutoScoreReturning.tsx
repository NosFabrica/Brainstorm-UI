import {useEffect} from "react";
import { useOncePerPubkey } from "@/hooks/useOncePerPubkey";
import { triggerScoringAndAnchor } from "@/services/trustAnchor";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { knownFollowCount } from "@/lib/followStore";
import { useSelfHistory } from "@/hooks/useSelf";
import { identityHas } from "@/accounts/display";
import { accountKey } from "@/lib/accountStorage";
import { useHasSession } from "@/hooks/useHasSession";

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
  const user = useActiveAccountDisplay();
  const pk = useHasSession() ? user?.pubkey : undefined;
  // Only decide once the /user/history query has actually settled, so we never
  // mistake "still loading" for "unscored".
  const history = useSelfHistory(pk);
  const once = useOncePerPubkey();

  useEffect(() => {
    if (!pk || once.done(pk) || !history.isSuccess) return;

    // `ta_pubkey` is NOT evidence of scoring: the backend mints the assistant
    // key during login itself (authChallenge verify), so every session-holder
    // has one before any calculation ran. The graperank timestamps are the real
    // signal — null until a calc was actually triggered for this account.
    const h = (history.data as { data?: {
      last_time_calculated_graperank?: string | null;
      last_time_triggered_graperank?: string | null;
    } } | undefined)?.data;
    const scored = !!(h?.last_time_calculated_graperank || h?.last_time_triggered_graperank);
    if (scored) return; // a calc was already triggered for this account

    const createdInApp = identityHas(pk, "createdInApp");
    let recentlyTriggered = false;
    try {
      const at = Number(localStorage.getItem(accountKey("brainstorm_calc_triggered_at", pk)) || 0);
      recentlyTriggered = at > 0 && Date.now() - at < 30 * 60_000;
    } catch { /* ignore */ }
    if (createdInApp || recentlyTriggered) return; // first-timer / just-triggered
    if (knownFollowCount(pk) < 1) return; // no follows → the home-page nudge handles it

    // At most ONE automatic kick per account, ever.
    //
    // `scored` (the graperank trigger timestamps) is the durable, cross-device
    // guard — but it only flips once the backend records the trigger. If that
    // write never lands, the other guard (recentlyTriggered) expires after 30
    // minutes, so EVERY app open past that window silently enqueued another full
    // network recalculation: the calc ran, the "ready" nudge fired again, and
    // dismissing it only lasted until the next launch. Reported from an iOS PWA
    // as the app re-announcing "your Web of Trust is ready" on every open.
    //
    // An automatic retry loop is the wrong response to scoring not producing a
    // result anyway — it burns queue capacity for every affected user at once. One
    // attempt, then leave it to the explicit (and now confirmed) Recalculate.
    let alreadyKicked = false;
    try { alreadyKicked = localStorage.getItem(accountKey("brainstorm_auto_score_kicked", pk)) === "true"; } catch { /* ignore */ }
    if (alreadyKicked) return;

    once.mark(pk);
    try { localStorage.setItem(accountKey("brainstorm_auto_score_kicked", pk), "true"); } catch { /* ignore */ }
    void triggerScoringAndAnchor(pk);
  }, [pk, history.isSuccess, history.data]);

  return null;
}
