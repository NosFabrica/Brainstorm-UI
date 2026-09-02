import { useQuery } from "@tanstack/react-query";
import { fetchPlans, type BillingPlan } from "@/services/subscription";
import { cadenceDays, FALLBACK_RECALC_DAYS } from "@/lib/plans";

/**
 * The plans this instance offers, shared app-wide (pricing page, account menu,
 * checkout dialog, Insights cadence copy).
 *
 * Three rules, all encoded here rather than at call sites:
 *
 * - **The order is the server's.** `plans` is rendered as given and never
 *   sorted — the default policy comes first because the server puts it first,
 *   and the rest follow Flash's own `sortOrder`, not a client heuristic.
 * - **Availability fails OPEN.** `billingAvailable` is `false` only on a
 *   confirmed empty `plans` array — the deliberate "this instance has no
 *   billing" signal (self-hosts). While loading, or if the call errors, it is
 *   `undefined` and entry points stay visible: a transient API failure must
 *   not unsell the product.
 * - **Cadences are runtime data.** `recalcDaysFor()` reads the plan's own
 *   `schedule_interval_seconds`; the build-time scalar is a clearly-named last
 *   resort, not the truth.
 */
export function useBillingPlans(): {
  /** In server order. Do not sort. */
  plans: BillingPlan[] | undefined;
  /** false ONLY on a confirmed empty array; undefined while unknown. */
  billingAvailable: boolean | undefined;
  /** Cadence in days for one row, from its own interval. */
  recalcDaysFor: (plan: BillingPlan | undefined) => number;
  /**
   * The single policy name on sale, when there is exactly one — the account
   * menu's "Get X". Null when nothing is purchasable or several things are, so
   * the caller can say "See plans" instead of naming one arbitrarily.
   */
  solePurchasableName: string | null;
  isLoading: boolean;
  /** The call failed. Distinct from "nothing on sale", which is an empty array. */
  loadFailed: boolean;
} {
  const query = useQuery({
    queryKey: ["billing-plans"],
    queryFn: fetchPlans,
    staleTime: 5 * 60_000,
    retry: 1,
  });
  const plans = query.data;

  const recalcDaysFor = (plan: BillingPlan | undefined) =>
    cadenceDays(plan?.scheduleIntervalSeconds) ?? FALLBACK_RECALC_DAYS;

  const purchasableNames = Array.from(
    new Set((plans ?? []).filter((p) => p.checkoutUrl).map((p) => p.policyName)),
  );

  return {
    plans,
    billingAvailable: plans === undefined ? undefined : plans.length > 0,
    recalcDaysFor,
    solePurchasableName: purchasableNames.length === 1 ? purchasableNames[0] : null,
    isLoading: query.isPending,
    loadFailed: query.isError,
  };
}
