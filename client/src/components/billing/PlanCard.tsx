import { Link } from "wouter";
import { CalendarClock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { useSubscription } from "@/hooks/useSubscription";
import { TIERS, PAID_TIER, formatPrice, nextScheduledLabel, type SubscriptionStatus } from "@/lib/plans";

/**
 * "What plan am I on, and when do my scores update next?" — on /insights,
 * because that page already calls itself the account page and already answers
 * the two questions either side of this one.
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
  const { tier, status, currentPeriodEnd, isLoading } = useSubscription();
  const info = TIERS[tier];
  const paid = tier === PAID_TIER;

  const next = nextScheduledLabel(lastCalculatedMs, tier);

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
            {STATUS_LABEL[status]}
          </Chip>
        )}
      </div>

      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5 text-sm">
        <Row label="Plan">
          <span data-testid="insights-plan-name">
            {info.name}
            {paid && <span className="text-slate-500 dark:text-slate-400"> · {formatPrice(tier)}/mo</span>}
          </span>
        </Row>

        <Row label="Recalculated">
          every {info.recalcIntervalDays} days
        </Row>

        {/* Derived from the plan's interval and the last run, not reported by the
            scheduler — there is no user-facing next-run field today. Labelled
            "scheduled" rather than "will run" for that reason. If the backend
            ever exposes a real next-run, prefer it over this arithmetic. */}
        <Row label="Next scheduled">
          <span data-testid="insights-next-run">{next ?? "—"}</span>
        </Row>

        {paid && currentPeriodEnd && (
          <Row label={status === "canceled" ? "Access until" : "Renews"}>
            {fmtDate(currentPeriodEnd)}
          </Row>
        )}
      </dl>

      {!paid && !isLoading && (
        <p className="mt-3.5 text-[13px] text-slate-500 dark:text-slate-400">
          <Link href="/pricing" className="font-medium text-brand-link hover:underline" data-testid="insights-plan-link">
            {TIERS[PAID_TIER].name} recalculates every {TIERS[PAID_TIER].recalcIntervalDays} days →
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

const STATUS_LABEL: Record<SubscriptionStatus, string> = {
  none: "—",
  active: "Active",
  past_due: "Payment due",
  grace: "Grace period",
  canceled: "Canceled",
};

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
