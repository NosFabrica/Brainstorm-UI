import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatAmount, formatBillingDate, formatBillingInterval } from "@/lib/plans";
import { npubFromPubkey } from "@/lib/shareId";
import { statusTone } from "./DivergenceRows";
import { describeCycles, describeDunning, describePolicy, readFlashSubscription } from "./flashRecord";
import { flashRecordKey } from "./FlashFactsStrip";

/**
 * One Flash subscription, read the way an operator asks about it: since when,
 * how many cycles, what they pay, when the next charge lands, how a failed
 * renewal is going, and how it ends. Every line is a fact off Flash's record;
 * a fact Flash did not send is simply not on the sheet.
 */
export function FlashSubscriptionSheet({ raw }: { raw: unknown }) {
  const r = readFlashSubscription(raw);
  const price =
    r.amountMinor !== null && r.currency ? formatAmount(r.amountMinor, r.currency) : null;
  const interval = formatBillingInterval(r.billingInterval);
  const cycles = describeCycles(r);
  const dunning = describeDunning(r);
  const policy = describePolicy(r);
  const inTrial = r.status === "trial";
  const cancelled = !!(r.canceledAt || r.cancelEffectiveDate);
  const hasPlan = !!(r.planName || price);

  return (
    <div
      className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3"
      data-testid="flash-sheet"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone={statusTone(r.status)} size="sm" data-testid="flash-sheet-status">
          {r.status}
        </Chip>
        {hasPlan && (
          <span className="text-sm font-medium text-slate-900 dark:text-slate-100" data-testid="flash-sheet-plan">
            {r.planName}
            {r.planName && price ? " · " : ""}
            {price}
            {price && interval ? ` ${interval}` : ""}
            {r.trialDays ? ` · ${r.trialDays}-day trial` : ""}
            {r.setupFeeMinor && r.currency ? ` · ${formatAmount(r.setupFeeMinor, r.currency)} setup fee` : ""}
          </span>
        )}
        {r.id && (
          <span className="ml-auto font-mono text-[11px] text-slate-500 dark:text-slate-400" data-testid="flash-sheet-id">
            {r.id}
          </span>
        )}
      </div>

      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
        {r.createdAt && <Fact label="Subscribed" value={formatBillingDate(r.createdAt)} testId="flash-sheet-since" />}
        {cycles && <Fact label="Billing cycles" value={cycles} testId="flash-sheet-cycles" />}
        {(r.currentPeriodStart || r.currentPeriodEnd) && (
          <Fact
            label="Current period"
            value={`${formatBillingDate(r.currentPeriodStart)} → ${formatBillingDate(r.currentPeriodEnd)}`}
            testId="flash-sheet-period"
          />
        )}
        {inTrial && r.trialEndDate && (
          <Fact label="Trial ends" value={formatBillingDate(r.trialEndDate)} testId="flash-sheet-trial" />
        )}
        {r.nextBillingDate && !cancelled && (
          <Fact label="Next bill" value={formatBillingDate(r.nextBillingDate)} testId="flash-sheet-next-bill" />
        )}
        <Fact label="Account" value={accountLabel(r.ref)} testId="flash-sheet-ref" />
      </dl>

      {dunning && (
        <p className="text-sm text-amber-700 dark:text-amber-300" data-testid="flash-sheet-dunning">
          <span className="font-medium">Failed renewal.</span> {dunning}
          {r.firstFailedAt ? ` · first failed ${formatBillingDate(r.firstFailedAt)}` : ""}
        </p>
      )}

      {cancelled && (
        <p className="text-sm text-slate-700 dark:text-slate-300" data-testid="flash-sheet-cancellation">
          <span className="font-medium">Cancelled</span>
          {r.canceledAt ? ` ${formatBillingDate(r.canceledAt)}` : ""}
          {r.cancelEffectiveDate ? ` · ends ${formatBillingDate(r.cancelEffectiveDate)}` : ""}
          {r.cancelReason ? ` · "${r.cancelReason}"` : ""}
        </p>
      )}

      {policy && (
        <p className="text-xs text-slate-500 dark:text-slate-400" data-testid="flash-sheet-policy">
          {policy}
        </p>
      )}

      {r.portalUrl && (
        <a
          href={r.portalUrl}
          target="_blank"
          rel="noopener"
          className="inline-flex items-center gap-1 text-xs font-medium text-brand-deep dark:text-brand-link hover:underline"
          data-testid="flash-sheet-portal"
        >
          Their Flash portal <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}

/**
 * The `ref` is our hex pubkey when the checkout carried one. Shown as the npub
 * the roster uses, so it can be recognised against the row that opened the
 * dialog; a ref that is not a pubkey (nothing today, but Flash echoes whatever
 * was sent) reads as itself; none is a signup that named nobody.
 */
function accountLabel(ref: string | null): React.ReactNode {
  if (!ref) return "Named no account";
  if (/^[0-9a-f]{64}$/i.test(ref)) {
    const npub = npubFromPubkey(ref.toLowerCase());
    return (
      <span className="font-mono text-xs" title={ref}>
        {npub.slice(0, 12)}…{npub.slice(-5)}
      </span>
    );
  }
  return <span className="font-mono text-xs break-all">{ref}</span>;
}

function Fact({ label, value, testId }: { label: string; value: React.ReactNode; testId: string }) {
  return (
    <div data-testid={testId}>
      <dt className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="text-slate-900 dark:text-slate-100">{value}</dd>
    </div>
  );
}

/**
 * One dialog, two handles: a subscriber is looked up by pubkey, an unresolved
 * signup only by its Flash id — which is also the only way to see what state
 * that signup is actually in, since the report row carries no status.
 */
export type FlashRecordTarget = {
  /** Keeps one record's cached body apart from another's. */
  key: string;
  /** How the dialog names it: an npub for a person, the id for a signup. */
  label: string;
  read: () => Promise<unknown>;
};

export function FlashRecordDialog({
  target,
  onClose,
}: {
  target: FlashRecordTarget | null;
  onClose: () => void;
}) {
  const query = useQuery({
    queryKey: flashRecordKey(target?.key ?? ""),
    queryFn: () => target!.read(),
    enabled: !!target,
    // Every read spends our Flash quota, so don't re-ask on a reopen or a retry.
    staleTime: 60_000,
    retry: false,
    gcTime: 0,
  });
  const body = query.data as { subscriptions?: unknown[]; livemode?: unknown } | undefined;
  const rows = Array.isArray(body?.subscriptions) ? body.subscriptions : null;
  // Flash marks every response with the key's mode; a test key is worth a flag.
  const testMode = body?.livemode === false;

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl" data-testid="dialog-billing-flash-record">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Flash's record
            {rows && (
              <Chip tone={rows.length > 1 ? "warning" : "neutral"} size="sm">
                {rows.length} {rows.length === 1 ? "row" : "rows"}
              </Chip>
            )}
            {testMode && (
              <Chip tone="warning" size="sm" data-testid="billing-flash-record-testmode">
                Test mode
              </Chip>
            )}
          </DialogTitle>
          <DialogDescription>
            Exactly what Flash returned for {target?.label ?? ""} — every row, not
            just the one entitlement uses. Nothing was changed by looking.
          </DialogDescription>
        </DialogHeader>
        {query.isPending ? (
          <div className="flex items-center gap-2 py-6 text-sm text-slate-500 dark:text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Asking Flash…
          </div>
        ) : query.isError ? (
          <p className="py-4 text-sm text-slate-500 dark:text-slate-400" data-testid="billing-flash-record-error">
            {(query.error as Error)?.message}
          </p>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-auto pr-1">
            {rows?.map((row, i) => (
              <FlashSubscriptionSheet key={(row as { id?: string })?.id ?? i} raw={row} />
            ))}
            <details className="group">
              <summary className="cursor-pointer text-xs font-medium text-slate-500 dark:text-slate-400 hover:underline">
                Raw record
              </summary>
              <pre
                className="mt-2 max-h-[40vh] overflow-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 p-3 font-mono text-xs text-slate-700 dark:text-slate-200"
                data-testid="billing-flash-record-json"
              >
                {JSON.stringify(query.data, null, 2)}
              </pre>
            </details>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} data-testid="button-billing-flash-record-close">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
