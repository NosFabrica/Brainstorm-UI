import { useQuery } from "@tanstack/react-query";
import { productName } from "@/lib/plans";
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
   * The one product on sale, named the way Flash sells it — the account menu's
   * "Get X". Several prices for one policy are still one product, named by the
   * first-listed plan. Null when nothing is purchasable or the plans on sale
   * grant different policies, so the caller says "See plans" rather than pick.
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

  // One product can sell at several prices — monthly and yearly, or a test
  // cadence beside the real one — and every price grants the same policy. So
  // the count that matters is policies on sale, not plans; and the server
  // lists plans in Flash's order, the operator's own, so the first plan of the
  // one policy is its headline name.
  const purchasable = (plans ?? []).filter((p) => p.checkoutUrl);
  const policiesOnSale = new Set(purchasable.map((p) => p.policyId));

  return {
    plans,
    billingAvailable: plans === undefined ? undefined : plans.length > 0,
    recalcDaysFor,
    solePurchasableName: policiesOnSale.size === 1 ? productName(purchasable[0]) : null,
    isLoading: query.isPending,
    loadFailed: query.isError,
  };
}
