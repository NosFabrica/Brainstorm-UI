import { useQuery } from "@tanstack/react-query";
import { fetchPlans, type BillingPlan } from "@/services/subscription";
import { FALLBACK_RECALC_DAYS, planPriceLabel, type TierId } from "@/lib/plans";

/**
 * The plans this instance offers, shared app-wide (pricing page, footer link,
 * account menu, checkout, Insights cadence copy).
 *
 * Two rules from the handoff, both encoded here rather than at call sites:
 *
 * - **Availability fails OPEN.** `billingAvailable` is `false` only on a
 *   confirmed empty `plans` array — the deliberate "this instance has no
 *   billing" signal (self-hosts). While loading, or if the call errors, it is
 *   `undefined`/`true`-ish and entry points stay visible with fallback copy: a
 *   transient API failure must not unsell the product.
 * - **Cadences are runtime data.** `recalcDays()` prefers the live
 *   `schedule_interval_seconds`; the build-time constant is a clearly-named
 *   last resort, not the truth.
 */
export function useBillingPlans(): {
  plans: BillingPlan[] | undefined;
  planFor: (tier: TierId) => BillingPlan | undefined;
  /** false ONLY on a confirmed empty array; undefined while unknown. */
  billingAvailable: boolean | undefined;
  recalcDays: (tier: TierId) => number;
  /** "$2" / "2 EUR" / "Free" — live plan price, constants as fallback. */
  priceLabel: (tier: TierId) => string;
  isLoading: boolean;
} {
  const query = useQuery({
    queryKey: ["billing-plans"],
    queryFn: fetchPlans,
    staleTime: 5 * 60_000,
    retry: 1,
  });
  const plans = query.data;
  const planFor = (tier: TierId) => plans?.find((p) => p.tier === tier);
  const recalcDays = (tier: TierId) => {
    const secs = planFor(tier)?.scheduleIntervalSeconds;
    return typeof secs === "number" && secs > 0
      ? Math.max(1, Math.round(secs / 86_400))
      : FALLBACK_RECALC_DAYS[tier];
  };
  return {
    plans,
    planFor,
    billingAvailable: plans === undefined ? undefined : plans.length > 0,
    recalcDays,
    priceLabel: (tier: TierId) => planPriceLabel(planFor(tier), tier),
    isLoading: query.isPending,
  };
}
