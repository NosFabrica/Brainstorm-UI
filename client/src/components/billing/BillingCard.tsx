import { useState } from "react";
import { Link } from "wouter";
import { Loader2, ArrowRight, CreditCard, Zap, Receipt , ExternalLink } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Button } from "@/components/ui/button";
import { useSubscription } from "@/hooks/useSubscription";
import { cancelSubscription } from "@/services/subscription";
import { FEATURES } from "@/config/featureFlags";
import { useToast } from "@/hooks/use-toast";
import { TIERS, PAID_TIER, formatSats, type SubscriptionStatus, type Rail } from "@/lib/plans";

/**
 * Billing in Settings, because Settings is where you CHANGE things.
 *
 * The read-only half — schedule, next run, calculation history — lives on
 * /insights, which is where you CHECK things. What belongs HERE is the money:
 * and money surfaces have their own genre. People trust a billing page that
 * looks like a statement — labelled rows, tabular figures, a payment method
 * with an icon, cents on the amounts — and distrust one that chats at them.
 * So this reads like a receipt, not a paragraph.
 *
 * ## What the payments section can honestly show
 *
 * We have no verified transaction feed yet (Flash's transactions endpoint is
 * UNVERIFIED — docs/payments/FLASH-INTEGRATION.md). But an active paid period
 * IMPLIES its opening payment: if your period ends Sep 18, you paid $2.00 a
 * month before. That one derived row is shown, labelled as the current period.
 * Full history arrives when the Flash integration is verified — the note says
 * so rather than padding the table with fabricated rows.
 *
 * ## Cancellation
 *
 * Follows `subscription.manageUrl` — Flash's hosted portal today; if Flash
 * ever confirms a cancel API, the server starts returning a URL into our own
 * app and this code doesn't change (handoff A6). The portal signs people in
 * with a magic-link email, so the confirm copy warns about that — generically,
 * because we deliberately don't store the subscriber's address. Mock mode
 * keeps the local cancel so the demo flow works. The old DELETE is gone.
 */
export function BillingCard() {
  const { tier, status, currentPeriodEnd, rail, manageUrl, isLoading } = useSubscription();
  const info = TIERS[tier];
  const paid = tier === PAID_TIER;
  const qc = useQueryClient();
  const { toast } = useToast();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  // Past-due and grace can still cancel: someone whose card failed may want out
  // rather than to fix it, and refusing until they pay would be indefensible.
  const canCancel = paid && status !== "canceled" && status !== "none";

  // A sats payer is quoted in sats everywhere an amount appears; a card payer
  // in dollars-and-cents. One label, three call sites, no mixed currencies.
  const lightning = rail === "flash-lightning";
  const amount = (info.usdMinorPerMonth / 100).toFixed(2);
  const amountLabel = lightning ? formatSats(tier) : `$${amount}`;
  const periodEnd = currentPeriodEnd ? new Date(currentPeriodEnd) : null;
  // Monthly billing: the current period opened one month before it closes.
  const periodStart = periodEnd ? addMonths(periodEnd, -1) : null;

  const doCancel = async () => {
    // Real mode: hand over to the portal, straight away — more friction than
    // subscribing is already the wrong side of several jurisdictions' rules,
    // so no interstitial beyond this confirm row.
    if (FEATURES.subscriptionApi && manageUrl) {
      window.location.href = manageUrl;
      return;
    }
    setBusy(true);
    try {
      await cancelSubscription();
      await qc.invalidateQueries({ queryKey: ["/user/subscription"] });
      toast({
        title: "Subscription cancelled",
        description: `${info.name} runs to the end of the period you've paid for.`,
      });
    } catch (e) {
      toast({
        title: "Couldn't cancel",
        description: e instanceof Error ? e.message : "Please try again, or get in touch.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  return (
    <Card className="overflow-hidden" data-testid="settings-billing-card">
      {/* Statement header */}
      <div className="flex items-center justify-between gap-3 px-5 sm:px-6 pt-5 sm:pt-6 pb-4 border-b border-slate-100 dark:border-slate-800/60">
        <div className="flex items-center gap-2.5">
          <h2
            className="text-base font-bold text-slate-900 dark:text-slate-100 tracking-tight"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Billing
          </h2>
          {!isLoading && (
            <Chip
              tone={status === "active" ? "success" : status === "canceled" ? "neutral" : "warning"}
              size="sm"
              data-testid="billing-status"
            >
              {paid ? STATUS_LABEL[status] : "Free plan"}
            </Chip>
          )}
        </div>
        <Link
          href="/insights"
          className="text-[13px] font-medium text-brand-link hover:underline"
          data-testid="billing-insights-link"
        >
          Schedule & history →
        </Link>
      </div>

      {/* Account summary — labelled rows, statement-style */}
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-3 px-5 sm:px-6 py-5 text-sm">
        <Row label="Plan">
          <span className="font-semibold" data-testid="billing-plan">{info.name}</span>
        </Row>
        <Row label="Amount">
          <span className="tabular-nums" data-testid="billing-amount">
            {paid ? `${amountLabel} / month` : "$0.00"}
          </span>
        </Row>
        <Row label="Payment method">
          {paid && rail ? <RailBadge rail={rail} /> : <span className="text-slate-400">—</span>}
        </Row>
        <Row label={status === "canceled" ? "Access until" : "Next invoice"}>
          <span className="tabular-nums" data-testid="billing-next-invoice">
            {paid && periodEnd ? (status === "canceled" ? fmtDate(periodEnd) : `${fmtDate(periodEnd)} · ${amountLabel}`) : "—"}
          </span>
        </Row>
      </dl>

      {/* Payments — a real table, with only the row we can actually stand behind. */}
      <div className="px-5 sm:px-6 pb-5">
        <div className="flex items-center gap-1.5 mb-2">
          <Receipt className="h-3.5 w-3.5 text-slate-400" />
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Payments
          </span>
        </div>
        <div className="rounded-xl border border-slate-100 dark:border-slate-800/60 overflow-hidden">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900/60 text-left text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <th className="px-3 py-2 font-semibold">Date</th>
                <th className="px-3 py-2 font-semibold">Description</th>
                <th className="px-3 py-2 font-semibold">Method</th>
                <th className="px-3 py-2 font-semibold text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {paid && periodStart ? (
                <tr className="text-slate-700 dark:text-slate-200" data-testid="billing-payment-row">
                  <td className="px-3 py-2.5 tabular-nums whitespace-nowrap">{fmtDate(periodStart)}</td>
                  <td className="px-3 py-2.5">
                    {info.name} — {fmtDate(periodStart)} to {fmtDate(periodEnd!)}
                  </td>
                  <td className="px-3 py-2.5">{rail ? <RailBadge rail={rail} compact /> : "—"}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-medium">{amountLabel}</td>
                </tr>
              ) : (
                <tr>
                  <td colSpan={4} className="px-3 py-5 text-center text-slate-400 dark:text-slate-500" data-testid="billing-no-payments">
                    No payments — you're on the free plan.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {paid && (
          <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
            Full payment history will appear here once the Flash integration is
            complete. Payments are processed by Flash — we never hold your card
            details.
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2 px-5 sm:px-6 py-4 border-t border-slate-100 dark:border-slate-800/60 bg-slate-50/60 dark:bg-slate-900/40">
        <Button asChild variant={paid ? "outline" : "primary"} className="gap-1.5">
          <Link href="/pricing" data-testid="billing-change-plan">
            {paid ? "Change plan" : `Get ${TIERS[PAID_TIER].name}`}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>

        {/* The portal is also where an expiring card or a Lightning connection
            gets updated — the most common billing event there is, so it can't
            be reachable only by starting a cancel. New tab: the portal is
            Flash's page, and the app stays alive behind it. */}
        {paid && manageUrl && (
          <Button
            variant="outline"
            className="gap-1.5"
            onClick={() => window.open(manageUrl, "_blank", "noopener,noreferrer")}
            data-testid="billing-manage"
          >
            <ExternalLink className="h-4 w-4" /> Manage payment method
          </Button>
        )}

        {canCancel && !confirming && (
          <Button
            variant="ghost"
            className="text-slate-600 dark:text-slate-300"
            onClick={() => setConfirming(true)}
            data-testid="billing-cancel"
          >
            Cancel subscription
          </Button>
        )}

        {canCancel && confirming && (
          <div className="flex flex-wrap items-center gap-2" data-testid="billing-cancel-confirm-row">
            <Button variant="destructive" disabled={busy} onClick={doCancel} data-testid="billing-cancel-confirm">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Yes, cancel
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => setConfirming(false)}>
              Keep it
            </Button>
          </div>
        )}

        {confirming && (
          <p className="w-full text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">
            You'll keep {info.name} until {periodEnd ? fmtDate(periodEnd) : "the end of the period you've paid for"} —
            nothing stops today. After that your scores go back to the free schedule.
            {FEATURES.subscriptionApi && manageUrl ? " Cancelling happens on Flash's page — they'll sign you in with a link sent to the email you subscribed with." : ""}
          </p>
        )}
      </div>
    </Card>
  );
}

/** Payment-method chip: the icon carries the rail, the text names the processor. */
function RailBadge({ rail, compact = false }: { rail: Rail; compact?: boolean }) {
  const card = rail === "card";
  const Icon = card ? CreditCard : Zap;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-0.5 font-medium text-slate-700 dark:text-slate-200"
      data-testid="billing-rail"
    >
      <Icon className={`h-3.5 w-3.5 ${card ? "text-slate-500" : "text-amber-500"}`} />
      {card ? "Card" : "Lightning"}
      {!compact && <span className="text-slate-400 dark:text-slate-500 font-normal">· Flash</span>}
    </span>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="text-right text-slate-900 dark:text-slate-100">{children}</dd>
    </div>
  );
}

const STATUS_LABEL: Record<SubscriptionStatus, string> = {
  none: "—",
  pending: "Confirming payment",
  active: "Active",
  past_due: "Payment due",
  grace: "Grace period",
  canceled: "Cancelled",
};

function addMonths(d: Date, n: number): Date {
  const out = new Date(d);
  out.setMonth(out.getMonth() + n);
  return out;
}

function fmtDate(d: Date): string {
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
