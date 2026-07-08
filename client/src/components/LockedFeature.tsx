import type { ReactNode } from "react";
import { useEntitlement } from "@/hooks/useEntitlement";
import { UpgradePrompt } from "@/components/UpgradePrompt";

/**
 * Wraps a gated surface: renders `children` when the user is entitled (or while
 * loading), otherwise blurs them behind an `UpgradePrompt` overlay. Cosmetic —
 * real enforcement is server-side.
 *
 *   <LockedFeature featureKey="semantic-search"><SemanticSearch /></LockedFeature>
 */
export function LockedFeature({
  featureKey,
  children,
}: {
  featureKey: string;
  children: ReactNode;
}) {
  const { allowed, isLoading } = useEntitlement(featureKey);

  if (allowed || isLoading) return <>{children}</>;

  return (
    <div className="relative" data-testid="locked-feature">
      <div className="pointer-events-none select-none blur-sm opacity-60" aria-hidden="true">
        {children}
      </div>
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <UpgradePrompt featureKey={featureKey} variant="overlay" />
      </div>
    </div>
  );
}
