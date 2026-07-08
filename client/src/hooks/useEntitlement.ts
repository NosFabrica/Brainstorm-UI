import { useSubscription } from "@/hooks/useSubscription";
import { featureRequiredTier, tierMeetsRequirement, type TierId } from "@/lib/plans";

/**
 * Whether the current user is entitled to a gated feature, and — if not — which
 * tier unlocks it. Cosmetic only: this drives locked-state UI + upgrade prompts;
 * real enforcement is server-side (out of scope for this branch).
 */
export function useEntitlement(featureKey: string): {
  allowed: boolean;
  requiredTier: TierId;
  currentTier: TierId;
  isLoading: boolean;
} {
  const { tier, isLoading } = useSubscription();
  const requiredTier = featureRequiredTier(featureKey);
  return {
    allowed: tierMeetsRequirement(tier, requiredTier),
    requiredTier,
    currentTier: tier,
    isLoading,
  };
}
