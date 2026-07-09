import { useLocation } from "wouter";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { resolveCheckout } from "@/lib/checkout";
import { isPurchasable, type TierId, type Rail } from "@/lib/plans";

/**
 * Returns `startCheckout(tier, rail?)` — the single entry every "Subscribe" /
 * "Upgrade" CTA calls. Redirects to Flash when configured, else routes to the
 * in-app checkout preview. The free tier is a no-op (nothing to buy).
 */
export function useCheckout(): (tier: TierId, rail?: Rail) => void {
  const [, navigate] = useLocation();
  const [currentUser] = useCurrentUser();

  return (tier: TierId, rail?: Rail) => {
    // Only paid, currently-available tiers can be checked out (free tier and
    // "coming soon" tiers like Guardian are no-ops).
    if (!isPurchasable(tier)) return;
    const target = resolveCheckout(tier, { rail, pubkey: currentUser?.pubkey });
    if (target.external) {
      window.location.assign(target.url);
    } else {
      navigate(target.url);
    }
  };
}
