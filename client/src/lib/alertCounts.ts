import { isFlaggedAlert, type NetworkAlertsData } from "@/services/api";

export interface AlertBannerCounts {
  /** Flagged people the reader follows that still need them. */
  follows: number;
  /** Of those, the ones flagged since the reader last looked. */
  followsNew: number;
  /** Flagged accounts further out in the reader's network. */
  wider: number;
  /** The server stopped listing before the end, so `wider` is a floor. */
  widerIsFloor: boolean;
}

/**
 * What the dashboard banner says: the flagged accounts the reader hasn't dealt
 * with, split by distance. `isHidden` is the reader's own decisions
 * (useAlertPrefs: acted on, or ignored and not since escalated); `isNew` is the
 * seen-store's diff (lib/networkAlertsSeen).
 */
export function alertBannerCounts(
  data: NetworkAlertsData | undefined,
  isHidden: (pubkey: string, reports: number) => boolean,
  isNew: (pubkey: string) => boolean,
): AlertBannerCounts {
  const out: AlertBannerCounts = { follows: 0, followsNew: 0, wider: 0, widerIsFloor: false };
  if (!data) return out;
  out.widerIsFloor = data.extendedNetworkTruncated;
  for (const e of [...data.directFollows, ...data.extendedNetwork]) {
    if (!isFlaggedAlert(e) || isHidden(e.pubkey, e.verifiedReporterCount)) continue;
    if (e.hops <= 1) {
      out.follows += 1;
      if (isNew(e.pubkey)) out.followsNew += 1;
    } else out.wider += 1;
  }
  return out;
}
