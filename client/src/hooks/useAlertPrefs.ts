import { useEffect, useState } from "react";
import {
  actedAlertSet,
  backfillIgnoredBaselines,
  hasEscalated,
  hydrateIgnoredFromNostr,
  ignoredAlertMap,
} from "@/lib/networkAlertsIgnored";

/**
 * The reader's own decisions about flagged accounts, shared by every surface
 * that shows Network Alerts (the dashboard banner, /alerts): who they acted on
 * (unfollowed, muted, reported — gone for good) and who they ignored, at how
 * many reports.
 *
 * The local copy paints at once; the account's encrypted NIP-78 list merges in
 * when it arrives, so a dismissal made on another device carries over. Entries
 * stored before escalation baselines existed are repaired against `current`
 * once — they would otherwise stay hidden at any report count.
 */
export function useAlertPrefs(observer: string, current?: { pubkey: string; verifiedReporterCount: number }[]) {
  const [dismissed, setDismissed] = useState<Set<string>>(() => actedAlertSet(observer));
  const [ignored, setIgnored] = useState<Map<string, number | null>>(() => ignoredAlertMap(observer));
  useEffect(() => {
    setIgnored(ignoredAlertMap(observer));
    setDismissed(actedAlertSet(observer));
    let live = true;
    void hydrateIgnoredFromNostr(observer)
      .then((merged) => {
        if (live) setIgnored(merged);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [observer]);

  // Guarded so it only writes when there's genuinely something to fix — persist() publishes.
  const currentSig = (current ?? []).map((e) => `${e.pubkey}:${e.verifiedReporterCount}`).join(",");
  useEffect(() => {
    if (!observer || !current?.length) return;
    const repaired = backfillIgnoredBaselines(observer, current);
    if (repaired) setIgnored(repaired);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [observer, currentSig]);

  /**
   * Acted-on accounts stay gone. Ignored ones stay hidden UNTIL their reports
   * materially worsen — ignoring someone at 9 reports shouldn't blind you at 60.
   */
  const isHidden = (pk: string, currentReports: number) => {
    if (dismissed.has(pk)) return true;
    if (!ignored.has(pk)) return false;
    return !hasEscalated(ignored.get(pk) ?? null, currentReports);
  };

  return { dismissed, setDismissed, ignored, setIgnored, isHidden };
}
