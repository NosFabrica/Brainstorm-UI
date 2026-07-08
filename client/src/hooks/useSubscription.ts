import { useQuery } from "@tanstack/react-query";
import { hasSessionToken } from "@/services/api";
import { fetchSubscription, DEFAULT_SUBSCRIPTION, type Subscription } from "@/services/subscription";
import type { TierId } from "@/lib/plans";

/**
 * The logged-in user's subscription (tier + status), backed by
 * `services/subscription.ts` (mock until the backend + Flash webhook sync ship).
 *
 * Defaults to the free Grapevine tier when logged out, loading, or on error —
 * so anonymous/public surfaces never see a locked state. Gated on
 * `hasSessionToken()` so it never fires for anonymous visitors (the real path
 * uses `authenticatedFetch`, which can 401-redirect public pages).
 */
export function useSubscription(): {
  subscription: Subscription;
  tier: TierId;
  status: Subscription["status"];
  currentPeriodEnd: string | null;
  rail: Subscription["rail"];
  isActive: boolean;
  isLoading: boolean;
} {
  const query = useQuery({
    queryKey: ["/user/subscription"],
    queryFn: fetchSubscription,
    enabled: hasSessionToken(),
    staleTime: 60_000,
  });

  const subscription = query.data ?? DEFAULT_SUBSCRIPTION;

  return {
    subscription,
    tier: subscription.tier,
    status: subscription.status,
    currentPeriodEnd: subscription.currentPeriodEnd,
    rail: subscription.rail,
    isActive: subscription.status === "active" || subscription.status === "grace",
    isLoading: hasSessionToken() && query.isPending,
  };
}
