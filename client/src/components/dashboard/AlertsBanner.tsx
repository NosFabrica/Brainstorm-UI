import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { ArrowRight, ShieldAlert } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Chip } from "@/components/ui/chip";
import { useAlertPrefs } from "@/hooks/useAlertPrefs";
import { useNetworkAlerts, selectFlaggedAlerts } from "@/hooks/useNetworkAlerts";
import { alertBannerCounts } from "@/lib/alertCounts";
import { computeNewAlerts } from "@/lib/networkAlertsSeen";

const people = (n: number) => (n === 1 ? "1 person you follow is" : `${n} people you follow are`);

/**
 * Network Alerts on the dashboard: a count and a way in, nothing more. The team
 * found the old card — every flagged follow with five actions each — too much
 * for the dashboard; the list, the actions and the context behind each flag
 * live on /alerts.
 *
 * Says nothing until there is something to act on: no banner while loading, on
 * error, or when none of the reader's follows is flagged.
 */
export function AlertsBanner({ observer, enabled }: { observer: string; enabled: boolean }) {
  const q = useNetworkAlerts(observer, { enabled });
  const data = q.data?.data;
  const flagged = useMemo(() => selectFlaggedAlerts(data), [data]);
  const { isHidden } = useAlertPrefs(observer, flagged);

  // "New since you last looked" — /alerts records the look; the first-ever
  // snapshot is a silent baseline, so nothing reads as new on a first visit.
  const [newSet, setNewSet] = useState<Set<string>>(new Set());
  const flaggedSig = flagged.map((e) => e.pubkey).join(",");
  useEffect(() => {
    if (!observer || !data) return;
    setNewSet(new Set(computeNewAlerts(observer, flaggedSig ? flaggedSig.split(",") : []).newPubkeys));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [observer, flaggedSig, !!data]);

  const counts = alertBannerCounts(data, isHidden, (pk) => newSet.has(pk));
  if (!enabled || q.isLoading || q.isError || !data) return null;
  // Only your follows put the banner up. Accounts further out are worth a
  // mention beside them, never a banner of their own — they're on /alerts.
  if (counts.follows === 0) return null;

  return (
    // One row at every width: the red tint and the shield carry the attention, so
    // the way in is a text link, not a full-width button competing with the
    // page's real call to action.
    <Alert
      variant="destructive"
      className="flex items-center gap-3 px-4 py-2.5 [&>svg]:static [&>svg~*]:pl-0"
      // A count that waits on the dashboard, not an emergency: announced politely, once.
      role="status"
      data-testid="alerts-banner"
    >
      <ShieldAlert className="h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
          {people(counts.follows)} flagged
          {counts.followsNew > 0 && (
            <Chip tone="danger" size="sm" data-testid="alerts-banner-new">
              {counts.followsNew} new
            </Chip>
          )}
        </p>
        {counts.wider > 0 && (
          <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400" data-testid="alerts-banner-wider">
            Also {counts.wider}
            {counts.widerIsFloor ? "+" : ""} flagged in your wider network
          </p>
        )}
      </div>
      <Link
        href="/alerts"
        className="inline-flex shrink-0 items-center gap-1 rounded text-sm font-semibold text-brand-link hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40"
        data-testid="alerts-banner-manage"
      >
        Manage <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </Alert>
  );
}
