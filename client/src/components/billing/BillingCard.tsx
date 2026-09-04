import { useState } from "react";
import { productName } from "@/lib/plans";
import { Link } from "wouter";
import { AlertTriangle, ArrowRight, ExternalLink, Receipt } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Button } from "@/components/ui/button";
import { useSubscription } from "@/hooks/useSubscription";
import { useBillingPlans } from "@/hooks/useBillingPlans";
import {
  billingDeadlineMs,
  formatAmount,
  formatBillingDate,
  formatBillingInterval,
  SUBSCRIPTION_STATUS_LABEL,
} from "@/lib/plans";

/**
 * Billing in Settings, because Settings is where you CHANGE things.
 *
 * The read-only half — schedule, next run, calculation history — lives on
 * /insights, which is where you CHECK things. What belongs HERE is the money:
 * and money surfaces have their own genre. People trust a billing page that
 * looks like a statement — labelled rows, tabular figures, cents on the
 * amounts — and distrust one that chats at them. So this reads like a receipt.
 *
 * ## Every number here was reported, not worked out
 *
 * This card used to derive the period start by subtracting a month from the
 * end, which was wrong for the daily rehearsal plan and wrong for a yearly one.
 * The subscription row carries `current_period_start`, `current_period_end` and
 * `next_billing_date`, so all three are rendered as sent. The amount is the
 * price Flash snapshotted when this person subscribed — not their policy's
 * current list price and not the plan's, because someone on a retired or
 * repriced mapping still pays what they signed up for. The server sources it
 * from their own subscription; a repricing in Flash's dashboard cannot reach
 * this card.
 *
 * There is no payment-method row: Flash's subscription object carries no such
 * field, so any badge here would be a guess dressed as a fact.
 *
 * ## Cancellation
 *
 * Follows `subscription.manageUrl` — Flash's hosted portal today; if Flash ever
 * confirms a cancel API, the server starts returning a URL into our own app and
 * this code doesn't change (handoff A6). Its PRESENCE is also the gate: the
 * server says whether cancelling is possible, so nothing here asks a feature
 * flag. The portal signs people in with a magic-link email, so the confirm copy
 * warns about that — generically, because we deliberately don't store the
 * subscriber's address.
 */
export function BillingCard() {
  const {
    policy,
    plan,
    status,
    currentPeriodStart,
    currentPeriodEnd,
    nextBillingDate,
    cancelEffectiveDate,
    manageUrl,
    isPaid: paid,
    isLoading,
  } = useSubscription();
  const { plans, billingAvailable, solePurchasableName } = useBillingPlans();
  const [confirming, setConfirming] = useState(false);

  // What they bought, named the way Flash sells it; the policy's admin name
  // only when the plan list cannot say (not loaded, or the mapping is gone).
  const bought = plan?.planId ? plans?.find((p) => p.planId === plan.planId) : undefined;
  const planName = (bought ? productName(bought) : null) ?? policy?.name ?? "—";
  // `is_active: false` means the mapping is no longer sellable. The subscriber
  // keeps the policy and the price; what they lose is the ability to re-buy it.
  const retired = plan !== null && !plan.isActive;

  // A free holder has no billing row, so their price is the default plan's own
  // amount — a number the server sends, not a "$0.00" typed in here.
  const priced = plan ?? plans?.find((p) => p.isDefault) ?? null;
  const amountLabel =
    priced && priced.amountMinor !== null && priced.currency
      ? formatAmount(priced.amountMinor, priced.currency)
      : "—";
  const period = formatBillingInterval(priced?.billingInterval);

  // Flash reports a cancellation that has not taken effect yet as `active` —
  // the subscriber IS still entitled and the status is right — so the date is
  // the only thing that distinguishes "renews then" from "ends then".
  const cancelAt = billingDeadlineMs(cancelEffectiveDate);
  const cancelPending = paid && cancelAt !== null && cancelAt > Date.now();
  const ending = status === "canceled" || cancelPending;

  // Past-due and grace can still cancel: someone whose card failed may want out
  // rather than to fix it, and refusing until they pay would be indefensible.
  // Already cancelling is the one case that cannot: there is nothing to cancel.
  const canCancel = paid && !ending && status !== "none" && manageUrl !== null;
  const accessEnds = cancelEffectiveDate ?? currentPeriodEnd;

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
              tone={ending ? "neutral" : status === "active" ? "success" : "warning"}
              size="sm"
              data-testid="billing-status"
            >
              {!paid ? "Free plan" : cancelPending ? "Cancelling" : SUBSCRIPTION_STATUS_LABEL[status]}
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
          <span className="font-semibold" data-testid="billing-plan">{planName}</span>
        </Row>
        <Row label="Amount">
          <span className="tabular-nums" data-testid="billing-amount">
            {amountLabel}
            {period && <span className="text-slate-500 dark:text-slate-400"> {period}</span>}
          </span>
        </Row>
        <Row label={ending ? "Access until" : "Next invoice"} testId="billing-next-label">
          <span className="tabular-nums" data-testid="billing-next-invoice">
            {!paid
              ? "—"
              : ending
                ? formatBillingDate(accessEnds)
                : nextBillingDate
                  ? `${formatBillingDate(nextBillingDate)} · ${amountLabel}`
                  : "—"}
          </span>
        </Row>
      </dl>

      {retired && (
        <div className="px-5 sm:px-6 pb-5">
          <Alert variant="warning" data-testid="billing-plan-retired">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>This plan is no longer offered</AlertTitle>
            <AlertDescription>
              You keep {planName} — and the price you signed up at — for as long as you stay on it.
              To move to a plan that is currently on sale,{" "}
              <Link href="/pricing" className="font-medium underline" data-testid="billing-retired-pricing">
                see what's available
              </Link>
              {manageUrl ? (
                <>
                  . To stop this one,{" "}
                  <a
                    href={manageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium underline"
                    data-testid="billing-retired-manage"
                  >
                    cancel it on Flash's page
                  </a>
                  .
                </>
              ) : (
                "."
              )}
            </AlertDescription>
          </Alert>
        </div>
      )}

      {/* Payments — the current period, with both of its dates as reported. */}
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
                <th className="px-3 py-2 font-semibold text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {paid && currentPeriodStart ? (
                <tr className="text-slate-700 dark:text-slate-200" data-testid="billing-payment-row">
                  <td className="px-3 py-2.5 tabular-nums whitespace-nowrap">{formatBillingDate(currentPeriodStart)}</td>
                  <td className="px-3 py-2.5">
                    {planName} — {formatBillingDate(currentPeriodStart)} to {formatBillingDate(currentPeriodEnd)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-medium">{amountLabel}</td>
                </tr>
              ) : (
                <tr>
                  <td colSpan={3} className="px-3 py-5 text-center text-slate-400 dark:text-slate-500" data-testid="billing-no-payments">
                    {paid ? "No payments recorded for this period yet." : "No payments — you're on the free plan."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {/* Flash never sends us invoices — they live in its portal, which the
            subscription links to. Say that, rather than promise a history. */}
        {paid && (
          <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
            Payments are processed by Flash — we never hold your card details.{" "}
            {manageUrl ? (
              <a
                href={manageUrl}
                target="_blank"
                rel="noopener"
                className="font-medium text-brand-link hover:underline"
                data-testid="billing-invoices-link"
              >
                Invoices and receipts are in Flash's portal
              </a>
            ) : (
              "Invoices and receipts are in Flash's portal."
            )}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2 px-5 sm:px-6 py-4 border-t border-slate-100 dark:border-slate-800/60 bg-slate-50/60 dark:bg-slate-900/40">
        {billingAvailable !== false && (
          <Button asChild variant={paid ? "outline" : "primary"} className="gap-1.5">
            <Link href="/pricing" data-testid="billing-change-plan">
              {paid ? "Change plan" : solePurchasableName ? `Get ${solePurchasableName}` : "See plans"}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        )}

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
            {/* Straight to the portal — more friction than subscribing is
                already the wrong side of several jurisdictions' rules. */}
            <Button
              variant="destructive"
              onClick={() => {
                window.location.href = manageUrl;
              }}
              data-testid="billing-cancel-confirm"
            >
              Continue to cancel
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Keep it
            </Button>
          </div>
        )}

        {confirming && (
          <p className="w-full text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">
            You'll keep {planName} until {accessEnds ? formatBillingDate(accessEnds) : "the end of the period you've paid for"} —
            nothing stops today. After that your scores go back to the free schedule.
            Cancelling happens on Flash's page — they'll sign you in with a link sent to the email you subscribed with.
          </p>
        )}
      </div>
    </Card>
  );
}

function Row({ label, testId, children }: { label: string; testId?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-slate-500 dark:text-slate-400" data-testid={testId}>{label}</dt>
      <dd className="text-right text-slate-900 dark:text-slate-100">{children}</dd>
    </div>
  );
}
