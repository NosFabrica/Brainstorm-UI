import { Link } from "wouter";
import { CalendarClock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { useSubscription } from "@/hooks/useSubscription";
import {
  cadenceDays,
  formatAmount,
  formatBillingPeriod,
  nextScheduledLabel,
  SUBSCRIPTION_STATUS_LABEL,
  type SubscriptionStatus,
} from "@/lib/plans";
import { useBillingPlans } from "@/hooks/useBillingPlans";

/**
 * "What plan am I on, and when do my scores update next?" — on /insights,
 * because that page already calls itself the account page and already answers
 * the two questions either side of this one.
 *
 * Everything here comes off the POLICY the person holds and the PLAN they
 * bought: the name, the price they are actually charged, and the cadence, which
 * is the live `schedule_interval_seconds` rather than a number compiled in. An
 * admin retuning a policy changes this card without a deploy.
 *
 * ## Why there is no pitch here
 *
 * On a 60-day schedule a free user's "last calculated" will regularly read forty
 * -something days ago, which is exactly the staleness argument the pricing page
 * leads with — except here it is about them, specifically. That makes it the most
 * honest upsell moment in the product and the easiest to overplay.
 *
 * So: facts, and one quiet link. No urgency, no colour, no repetition. Someone
 * looking at "47 days ago" beside "next run in 13 days" already has the whole
 * argument; anything louder turns the page people open when something feels
 * wrong into a page that sells at them.
 */
export function PlanCard({ lastCalculatedMs }: { lastCalculatedMs: number | null }) {
  const { policy, plan, status, currentPeriodEnd, cancelEffectiveDate, isPaid: paid, isLoading } =
    useSubscription();
  const { plans, billingAvailable, solePurchasableName, recalcDaysFor } = useBillingPlans();

  const days = cadenceDays(policy?.scheduleIntervalSeconds);
  const next = nextScheduledLabel(lastCalculatedMs, days, Date.now());

  const price = plan ? formatAmount(plan.amountMinor, plan.currency) : null;
  const period = plan ? formatBillingPeriod(plan.billingPeriodUnit, plan.billingPeriodCount) : null;

  // Flash reports a cancellation that has not taken effect yet as `active`, so
  // the date — not the status — is what turns "Renews" into "Access until".
  const cancelAt = cancelEffectiveDate ? new Date(cancelEffectiveDate) : null;
  const cancelPending = paid && cancelAt !== null && !Number.isNaN(cancelAt.getTime()) && cancelAt.getTime() > Date.now();
  const ending = status === "canceled" || cancelPending;
  const endsOn = cancelEffectiveDate ?? currentPeriodEnd;

  // The one thing on sale, when there is exactly one. Several, or none we can
  // name, and the link says "see plans" rather than picking one arbitrarily.
  const upsell = plans?.find((p) => p.checkoutUrl && p.policyName === solePurchasableName);

  return (
    <Card className="p-4 mb-4" data-testid="insights-plan-card">
      <div className="flex items-center gap-2 mb-3">
        <CalendarClock className="h-4 w-4 text-brand-deep dark:text-brand-accent" />
        <span
          className="text-sm font-bold text-slate-800 dark:text-slate-200"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Your plan
        </span>
        {!isLoading && status !== "active" && (
          <Chip tone={statusTone(status)} size="sm" data-testid="insights-plan-status">
            {SUBSCRIPTION_STATUS_LABEL[status]}
          </Chip>
        )}
      </div>

      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5 text-sm">
        <Row label="Plan">
          <span data-testid="insights-plan-name">
            {policy?.name ?? "—"}
            {price && (
              <span className="text-slate-500 dark:text-slate-400">
                {" "}· {price}{period ? ` ${period}` : ""}
              </span>
            )}
          </span>
        </Row>

        <Row label="Recalculated">
          <span data-testid="insights-recalc">{days ? everyDays(days) : "—"}</span>
        </Row>

        {/* Derived from the policy's interval and the last run, not reported by
            the scheduler — there is no user-facing next-run field today.
            Labelled "scheduled" rather than "will run" for that reason. If the
            backend ever exposes a real next-run, prefer it over this. */}
        <Row label="Next scheduled">
          <span data-testid="insights-next-run">{next ?? "—"}</span>
        </Row>

        {paid && endsOn && (
          <Row label={ending ? "Access until" : "Renews"}>
            <span data-testid="insights-renews">{fmtDate(endsOn)}</span>
          </Row>
        )}
      </dl>

      {!paid && !isLoading && billingAvailable !== false && (
        <p className="mt-3.5 text-[13px] text-slate-500 dark:text-slate-400">
          <Link href="/pricing" className="font-medium text-brand-link hover:underline" data-testid="insights-plan-link">
            {upsell && solePurchasableName
              ? `${solePurchasableName} recalculates ${everyDays(recalcDaysFor(upsell))}`
              : "See what's on offer"} →
          </Link>
        </p>
      )}
    </Card>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="font-medium text-slate-900 dark:text-slate-100 text-right">{children}</dd>
    </div>
  );
}

/** "every day" for the daily rehearsal plan, "every 7 days" for the rest. */
function everyDays(days: number): string {
  return days === 1 ? "every day" : `every ${days} days`;
}

function statusTone(s: SubscriptionStatus) {
  if (s === "past_due" || s === "grace") return "warning" as const;
  if (s === "canceled") return "neutral" as const;
  return "success" as const;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
