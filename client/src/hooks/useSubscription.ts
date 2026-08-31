import { useQuery } from "@tanstack/react-query";
import { hasSessionToken } from "@/services/api";
import { fetchSubscription, DEFAULT_SUBSCRIPTION, type Subscription } from "@/services/subscription";
import type { TierId } from "@/lib/plans";

/**
 * The logged-in user's subscription (tier + status), backed by
 * `services/subscription.ts` (mock until the backend + Flash webhook sync ship).
 *
 * Defaults to the free tier when logged out, loading, or on error, so anonymous
 * and public surfaces never see a locked state. Gated on `hasSessionToken()` so
 * it never fires for anonymous visitors — the real path uses
 * `authenticatedFetch`, which 401-redirects public pages.
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
  tier: TierId;
  status: Subscription["status"];
  currentPeriodEnd: string | null;
  /** When a scheduled cancellation takes effect; null if none. Still active. */
  cancelEffectiveDate: string | null;
  rail: Subscription["rail"];
  /** Flash's portal (or, later, our own flow) — where Cancel goes. */
  manageUrl: string | null;
  isActive: boolean;
  isLoading: boolean;
  refetch: () => void;
} {
  const query = useQuery({
    queryKey: ["/user/subscription"],
    queryFn: fetchSubscription,
    enabled: hasSessionToken(),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  const subscription = query.data ?? DEFAULT_SUBSCRIPTION;

  return {
    subscription,
    tier: subscription.tier,
    status: subscription.status,
    currentPeriodEnd: subscription.currentPeriodEnd,
    cancelEffectiveDate: subscription.cancelEffectiveDate,
    rail: subscription.rail,
    manageUrl: subscription.manageUrl,
    // Grace counts as active: a failed renewal inside Flash's 7-day grace window
    // must not read as "you've lost it" while retries are still running.
    isActive: subscription.status === "active" || subscription.status === "grace",
    isLoading: hasSessionToken() && query.isPending,
    refetch: () => void query.refetch(),
  };
}
