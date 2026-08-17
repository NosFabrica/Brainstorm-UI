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
 * `refetchOnWindowFocus` is load-bearing, not a default left switched on. Flash
 * publishes no return URL, so checkout opens in a new tab and the only signal
 * that someone finished paying is the browser handing focus back to us. This
 * one option is the entire "return from checkout" mechanism.
 */
export function useSubscription(): {
  subscription: Subscription;
  tier: TierId;
  status: Subscription["status"];
  currentPeriodEnd: string | null;
  rail: Subscription["rail"];
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
    rail: subscription.rail,
    // Grace counts as active: a failed renewal inside Flash's 7-day grace window
    // must not read as "you've lost it" while retries are still running.
    isActive: subscription.status === "active" || subscription.status === "grace",
    isLoading: hasSessionToken() && query.isPending,
    refetch: () => void query.refetch(),
  };
}
