import { useQuery } from "@tanstack/react-query";
import { useHasSession } from "@/hooks/useHasSession";
import {
  fetchSubscription,
  DEFAULT_SUBSCRIPTION,
  type Subscription,
} from "@/services/subscription";

/**
 * The logged-in user's subscription — the POLICY they hold, the PLAN they
 * bought, and the dates off their billing row — backed by
 * `services/subscription.ts`.
 *
 * Defaults to "no policy, nothing bought" when logged out, loading, or on
 * error, so anonymous and public surfaces never see a locked state. Gated on
 * `useHasSession()` so it never fires for anonymous visitors — the real path
 * uses `authenticatedFetch`, which 401-redirects public pages.
 *
 * Return-from-checkout is belt and braces: Flash redirects to
 * /billing/return (the primary), the in-flight poll re-reads Flash directly
 * (lib/checkoutPoll), and `refetchOnWindowFocus` remains as the backstop for
 * a tab someone left open — the checkout flow invalidates this query when it
 * opens Flash, so the focus refetch actually fires (it never does inside the
 * staleTime window; handoff A3).
 */
export function useSubscription(): {
  subscription: Subscription;
  policy: Subscription["policy"];
  plan: Subscription["plan"];
  /** True when they hold something other than the default policy. */
  isPaid: boolean;
  status: Subscription["status"];
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  nextBillingDate: string | null;
  /** When a scheduled cancellation takes effect; null if none. Still active. */
  cancelEffectiveDate: string | null;
  /** Flash's portal (or, later, our own flow) — where Cancel goes. */
  manageUrl: string | null;
  /**
   * How they pay, in Flash's own word, or null. Null far more often than not —
   * a free account, or a plan taking both Lightning and card — and every
   * surface renders null as no row at all rather than as a placeholder.
   */
  paymentMethod: string | null;
  isActive: boolean;
  isLoading: boolean;
  refetch: () => void;
} {
  const signedIn = useHasSession();
  const query = useQuery({
    queryKey: ["/user/subscription"],
    queryFn: fetchSubscription,
    enabled: signedIn,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  const subscription = query.data ?? DEFAULT_SUBSCRIPTION;
  const isPaid = subscription.policy !== null && !subscription.policy.isDefault;

  return {
    subscription,
    policy: subscription.policy,
    plan: subscription.plan,
    isPaid,
    status: subscription.status,
    currentPeriodStart: subscription.currentPeriodStart,
    currentPeriodEnd: subscription.currentPeriodEnd,
    nextBillingDate: subscription.nextBillingDate,
    cancelEffectiveDate: subscription.cancelEffectiveDate,
    manageUrl: subscription.manageUrl,
    paymentMethod: subscription.paymentMethod,
    // Grace counts as active: a failed renewal inside Flash's 7-day grace window
    // must not read as "you've lost it" while retries are still running.
    isActive: subscription.status === "active" || subscription.status === "grace",
    isLoading: signedIn && query.isPending,
    refetch: () => void query.refetch(),
  };
}
