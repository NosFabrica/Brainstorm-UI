import { Link } from "wouter";
import { Lock, Zap } from "lucide-react";
import { useCheckout } from "@/hooks/useCheckout";
import { TIERS, TIER_FEATURES, featureRequiredTier } from "@/lib/plans";

type Variant = "inline" | "card" | "overlay";

/**
 * Locked-state affordance for a gated feature. Reads the required tier + feature
 * label from plans.ts and offers an upgrade CTA (→ checkout) plus a link to the
 * pricing page. Presentational — pair with `useEntitlement` to decide when to show.
 */
export function UpgradePrompt({
  featureKey,
  variant = "card",
}: {
  featureKey: string;
  variant?: Variant;
}) {
  const startCheckout = useCheckout();
  const requiredTier = featureRequiredTier(featureKey);
  const tier = TIERS[requiredTier];
  const label = TIER_FEATURES[featureKey]?.label ?? "this feature";

  const priceText =
    tier.satsPerMonth === 0
      ? "Free"
      : `${tier.satsPerMonth.toLocaleString()} sats/mo · ${tier.usdApprox}`;

  if (variant === "inline") {
    return (
      <button
        type="button"
        onClick={() => startCheckout(requiredTier)}
        className="inline-flex items-center gap-1.5 rounded-full border border-[#c7cbff] bg-[#eef0ff] px-3 py-1 text-xs font-semibold text-[#4338ca] hover:bg-[#e0e3ff] transition-colors"
        data-testid="upgrade-prompt-inline"
      >
        <Lock className="h-3 w-3" /> Unlock with {tier.name}
      </button>
    );
  }

  return (
    <div
      className={`rounded-2xl border border-[#7c86ff]/30 bg-white/95 p-5 text-center shadow-sm ${
        variant === "overlay" ? "backdrop-blur-sm max-w-xs" : ""
      }`}
      data-testid="upgrade-prompt"
    >
      <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-[#eef0ff] text-[#4338ca]">
        <Lock className="h-4 w-4" />
      </div>
      <p className="mt-3 text-sm font-semibold text-slate-900">{label}</p>
      <p className="mt-1 text-xs text-slate-500">
        Included with <span className="font-semibold text-slate-700">{tier.name}</span> — {priceText}
      </p>
      <button
        type="button"
        onClick={() => startCheckout(requiredTier)}
        className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#6366f1] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#4f46e5]"
        data-testid="upgrade-prompt-cta"
      >
        <Zap className="h-3.5 w-3.5" /> Upgrade to {tier.name}
      </button>
      <Link
        href="/pricing"
        className="mt-2 block text-xs font-medium text-slate-400 hover:text-indigo-600 transition-colors"
      >
        Compare plans
      </Link>
    </div>
  );
}
