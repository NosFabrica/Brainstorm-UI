import { Check, X, ArrowRight, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Button } from "@/components/ui/button";
import { formatAmount, formatBillingInterval } from "@/lib/plans";
import type { BillingPlan } from "@/services/subscription";

/**
 * What's on offer, rendered from what the server says is on offer.
 *
 * One component for /pricing and the checkout dialog, because they were always
 * asking the same question. Every row is a plan and every cell is a fact off
 * `GET /billing/plans` — the policy name and cadence from our own scheduling
 * row, and the plan's name, price, interval and copy from Flash. Adding a
 * plan, a price or a yearly option changes this with no frontend release, and
 * with no transcription for anyone to keep correct.
 *
 * ## The three rules that keep it honest
 *
 * **Render the array as given.** Order is Flash's `sortOrder`, applied on the
 * server, with the default policy first because it is the one row nobody can
 * buy. Sorting here would put a client heuristic on top of that.
 *
 * **Whoever bought a plan is marked by that plan.** Staging sells one policy
 * through two plans — a daily rehearsal plan beside the real monthly one — so
 * marking by policy marked both as theirs and suppressed both calls to action,
 * leaving a subscriber no route between them. Flash's `planId` is the key,
 * matched and never interpreted.
 *
 * The policy answers only when there is no plan to match: the free row, and a
 * comped account with no billing row at all. It is deliberately NOT a fallback
 * for "their plan is not among these rows" — the checkout dialog renders a
 * single preselected row, so that test would mark the plan they are trying to
 * buy as already theirs and take its button away. A subscriber whose own plan
 * has been withdrawn therefore sees nothing marked and a live route to a
 * current plan, which is the outcome that leaves them somewhere to go;
 * `BillingCard` is where they read what they hold and what they are charged.
 *
 * **Format the interval, never match it.** `billingInterval` goes through
 * `formatBillingInterval`, so a word Flash has started sending and we have
 * never seen still renders. A row with no interval renders too: hiding it
 * would take a purchasable plan off the page.
 *
 * There is no monthly/yearly toggle. Yearly is a row — and a two-state toggle
 * could not express the $0.10/day plan that exists today.
 *
 * Copy (`description`, `features`, `notIncluded`) is plain text from Flash,
 * rendered as text by React. Never `dangerouslySetInnerHTML`: it is somebody
 * else's string on a public page of ours.
 */
export function PlanPicker({
  plans,
  currentPolicyId,
  currentPlanId = null,
  onChoose,
  loading = false,
  currentLabel = "Your plan",
  className,
}: {
  /** In server order. Undefined while the call is in flight. */
  plans: BillingPlan[] | undefined;
  /** The policy the viewer holds, or null when signed out / not yet known. */
  currentPolicyId: number | null;
  /**
   * The Flash plan they bought. Null when they have bought nothing — which is
   * what hands the marking back to `currentPolicyId`.
   */
  currentPlanId?: string | null;
  /**
   * Called synchronously from the row's click. Whatever opens a window must
   * stay inside that handler — popup blockers reject anything behind an await.
   */
  onChoose: (plan: BillingPlan) => void;
  loading?: boolean;
  currentLabel?: string;
  className?: string;
}) {
  if (plans === undefined) {
    return (
      <div className={className} data-testid="plan-picker-loading">
        <div className="flex items-center gap-2 py-8 text-sm text-slate-500 dark:text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading plans…
        </div>
      </div>
    );
  }

  return (
    <div className={`grid gap-4 ${className ?? ""}`} data-testid="plan-picker">
      {plans.map((plan, i) => (
        <PlanRow
          // Two rows can sell one policy, so the id alone is not unique.
          key={`${plan.policyId}-${i}`}
          index={i}
          plan={plan}
          current={
            currentPlanId !== null
              ? plan.planId === currentPlanId
              : currentPolicyId !== null && plan.policyId === currentPolicyId
          }
          loading={loading}
          currentLabel={currentLabel}
          onChoose={onChoose}
        />
      ))}
    </div>
  );
}

function PlanRow({
  index,
  plan,
  current,
  loading,
  currentLabel,
  onChoose,
}: {
  index: number;
  plan: BillingPlan;
  current: boolean;
  loading: boolean;
  currentLabel: string;
  onChoose: (plan: BillingPlan) => void;
}) {
  const price = formatAmount(plan.amountMinor, plan.currency);
  const period = formatBillingInterval(plan.billingInterval);
  // Flash names the plan; the free row has no Flash plan, so the policy's own
  // name is the only name it has.
  const title = plan.planName ?? plan.policyName;
  const days =
    typeof plan.scheduleIntervalSeconds === "number" && plan.scheduleIntervalSeconds > 0
      ? Math.max(1, Math.round(plan.scheduleIntervalSeconds / 86_400))
      : null;
  const purchasable = !!plan.checkoutUrl;

  return (
    <Card
      // `accent` is the design system's own "notice this one" treatment (an
      // Aurora wash with matching dark values), not a border-and-ring spelled
      // out here — which had no dark treatment of its own and would drift the
      // moment the palette moves.
      accent={current}
      className="flex flex-col gap-3 p-5 sm:p-6"
      data-testid={`plan-row-${index}`}
      data-policy-id={plan.policyId}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3
              className="text-base font-bold tracking-tight text-slate-900 break-words dark:text-slate-100"
              style={{ fontFamily: "var(--font-display)" }}
              data-testid={`plan-name-${index}`}
            >
              {title}
            </h3>
            {current && !loading && (
              <Chip tone="success" size="sm" data-testid={`plan-current-${index}`}>
                {currentLabel}
              </Chip>
            )}
          </div>
          {plan.description && (
            <p
              className="mt-1 text-sm text-slate-500 break-words dark:text-slate-400"
              data-testid={`plan-description-${index}`}
            >
              {plan.description}
            </p>
          )}
          {days !== null && (
            <p
              className="mt-1 text-sm text-slate-600 dark:text-slate-300"
              data-testid={`plan-cadence-${index}`}
            >
              New follows show up within {days === 1 ? "1 day" : `${days} days`}
            </p>
          )}
        </div>

        <div className="text-right">
          <p
            className="text-2xl font-bold tabular-nums tracking-tight text-slate-900 dark:text-slate-100"
            data-testid={`plan-price-${index}`}
          >
            {price}
          </p>
          {period && (
            <p
              className="text-xs text-slate-500 dark:text-slate-400"
              data-testid={`plan-period-${index}`}
            >
              {period}
            </p>
          )}
        </div>
      </div>

      {(plan.features || plan.notIncluded) && (
        <div className="space-y-1.5" data-testid={`plan-copy-${index}`}>
          {/* Two lists, not one — what you get and what you don't are separate
              claims, and a reader scanning ticks must not have to read each
              line to find out which kind it is. */}
          {plan.features && (
            <ul className="space-y-1.5" data-testid={`plan-included-${index}`}>
              {plan.features.map((line, i) => (
                <li
                  key={`in-${i}`}
                  className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-200"
                >
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <span className="min-w-0 break-words">{line}</span>
                </li>
              ))}
            </ul>
          )}
          {plan.notIncluded && (
            <ul className="space-y-1.5" data-testid={`plan-excluded-${index}`}>
              {plan.notIncluded.map((line, i) => (
                <li
                  key={`ex-${i}`}
                  className="flex items-start gap-2 text-sm text-slate-400 dark:text-slate-500"
                >
                  <X className="mt-0.5 h-4 w-4 shrink-0" />
                  <span className="min-w-0 break-words">{line}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* A row with no checkout_url offers nothing to buy — the free policy,
          and anything else the server declines to sell. Saying so is the whole
          content of that cell; a disabled button would imply a purchase. */}
      {purchasable && !current && (
        <Button
          className="mt-1 w-full gap-1.5 sm:w-auto sm:self-start"
          onClick={() => onChoose(plan)}
          data-testid={`plan-cta-${index}`}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              Get {title} <ArrowRight className="h-4 w-4" />
            </>
          )}
        </Button>
      )}
    </Card>
  );
}
