import { useState } from "react";
import { Link } from "wouter";
import { Loader2, ArrowRight } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Button } from "@/components/ui/button";
import { useSubscription } from "@/hooks/useSubscription";
import { cancelSubscription } from "@/services/subscription";
import { useToast } from "@/hooks/use-toast";
import { TIERS, PAID_TIER, formatPrice, type SubscriptionStatus } from "@/lib/plans";

/**
 * Billing in Settings, because Settings is where you CHANGE things.
 *
 * The read-only half — plan, next scheduled run, renewal date, calculation
 * history — lives on /insights, which is where you CHECK things. That split is
 * the whole reason this card is short: it carries the two actions (change plan,
 * cancel) and a one-line statement of what you're on, then points at Insights
 * for the detail rather than duplicating it.
 *
 * Cancelling sits here rather than on Insights deliberately. It is the most
 * consequential account action in the product, and every other irreversible one
 * — key backup, provider deactivation — already lives in Settings. Somewhere
 * people arrive on purpose, not somewhere they land while checking a date.
 *
 * NOTE: cancellation calls our own `DELETE /user/subscription`, and the backend
 * then calls Flash. A card-only subscriber has no Flash login, so this is the
 * only path that can work — and it depends on Flash's cancel endpoint, which is
 * UNVERIFIED (docs/payments/FLASH-INTEGRATION.md). Confirm it before trusting
 * this button in production.
 */
export function BillingCard() {
  const { tier, status, currentPeriodEnd, isLoading } = useSubscription();
  const info = TIERS[tier];
  const paid = tier === PAID_TIER;
  const qc = useQueryClient();
  const { toast } = useToast();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  // Past-due and grace can still cancel: someone whose card failed may want out
  // rather than to fix it, and refusing until they pay would be indefensible.
  const canCancel = paid && status !== "canceled" && status !== "none";

  const doCancel = async () => {
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
    <Card className="p-5 sm:p-6" data-testid="settings-billing-card">
      <div className="flex items-center gap-2.5">
        <h2
          className="text-base font-bold text-slate-900 dark:text-slate-100 tracking-tight"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Billing
        </h2>
        {!isLoading && status !== "active" && (
          <Chip tone={status === "canceled" ? "neutral" : "warning"} size="sm" data-testid="billing-status">
            {STATUS_LABEL[status]}
          </Chip>
        )}
      </div>

      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300" data-testid="billing-summary">
        You're on <span className="font-semibold text-slate-900 dark:text-slate-100">{info.name}</span>
        {paid && <> at {formatPrice(tier)} a month</>}
        {paid && currentPeriodEnd && (
          <>, {status === "canceled" ? "ending" : "renewing"} {fmtDate(currentPeriodEnd)}</>
        )}
        .{" "}
        <Link href="/insights" className="font-medium text-brand-link hover:underline" data-testid="billing-insights-link">
          See your schedule and history →
        </Link>
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button asChild variant={paid ? "outline" : "primary"} className="gap-1.5">
          <Link href="/pricing" data-testid="billing-change-plan">
            {paid ? "Change plan" : `Get ${TIERS[PAID_TIER].name}`}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>

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
      </div>

      {confirming && (
        <p className="mt-3 text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">
          You'll keep {info.name} until the end of the period you've already paid
          for — nothing stops today. After that your scores go back to the free
          schedule.
        </p>
      )}

      {paid && (
        <p className="mt-4 text-[11px] leading-relaxed text-slate-400 dark:text-slate-500">
          Payments are handled by Flash. To change the card you pay with, cancel
          and subscribe again — we never hold your card details, so we can't
          update them for you.
        </p>
      )}
    </Card>
  );
}

const STATUS_LABEL: Record<SubscriptionStatus, string> = {
  none: "—",
  active: "Active",
  past_due: "Payment due",
  grace: "Grace period",
  canceled: "Cancelled",
};

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
