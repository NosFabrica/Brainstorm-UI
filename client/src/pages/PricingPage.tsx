import { useLocation } from "wouter";
import { Check, ArrowUp } from "lucide-react";
import { FlashIcon } from "@/components/FlashIcon";
import { InfoPageLayout } from "@/components/InfoPageLayout";
import { PageHeader } from "@/components/PageHeader";
import { ComplianceStrip } from "@/components/ComplianceStrip";
import { useSubscription } from "@/hooks/useSubscription";
import { useCheckout } from "@/hooks/useCheckout";
import { hasSessionToken } from "@/services/api";
import {
  TIER_ORDER,
  TIERS,
  tierRank,
  previousTier,
  deltaFeaturesForTier,
} from "@/lib/plans";

export default function PricingPage() {
  const [, navigate] = useLocation();
  const { tier: currentTier } = useSubscription();
  const startCheckout = useCheckout();
  const loggedIn = hasSessionToken();

  return (
    <InfoPageLayout testId="page-pricing">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
        <div className="space-y-10 sm:space-y-12 animate-fade-up">
          <PageHeader
            kicker="Pricing"
            title={<>Own your <span className="text-[#333286]">web of trust</span></>}
            subtitle="Start free on the grapevine. Upgrade when you want fresher scores, your own data, or to protect your name — paid in sats over Lightning."
            testId="section-pricing-header"
          />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5" data-testid="grid-pricing-tiers">
            {TIER_ORDER.map((id) => {
              const tier = TIERS[id];
              const isCurrent = loggedIn && id === currentTier;
              const isUpgrade = tierRank(id) > tierRank(currentTier);
              const prev = previousTier(id);
              const featured = id === "sovereign";
              return (
                <div
                  key={id}
                  className={`relative flex flex-col rounded-2xl bg-white p-6 shadow-sm border transition-shadow ${
                    isCurrent
                      ? "border-[#7c86ff]/60 ring-1 ring-[#7c86ff]/50"
                      : featured
                        ? "border-[#7c86ff]/40"
                        : "border-[#7c86ff]/15"
                  }`}
                  data-testid={`card-tier-${id}`}
                >
                  {tier.badge && (
                    <span className="absolute -top-2.5 right-5 inline-flex items-center rounded-full bg-[#eef0ff] border border-[#c7cbff] px-2.5 py-0.5 text-[11px] font-semibold text-[#4338ca]">
                      {tier.badge}
                    </span>
                  )}

                  <h2 className="font-brand text-lg font-bold text-slate-900">{tier.name}</h2>

                  {/* Price */}
                  <div className="mt-3">
                    {tier.satsPerMonth === 0 ? (
                      <div className="text-3xl font-bold text-slate-900">Free</div>
                    ) : (
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-3xl font-bold text-slate-900 tabular-nums">{tier.satsPerMonth.toLocaleString()}</span>
                        <span className="text-sm font-semibold text-amber-600 inline-flex items-center gap-0.5"><FlashIcon className="h-3.5 w-3.5" />sats</span>
                        <span className="text-sm text-slate-400">/ mo</span>
                      </div>
                    )}
                    <div className="mt-1 text-xs text-slate-400">
                      {tier.satsPerMonth === 0 ? tier.tagline : `${tier.usdApprox} — ${tier.tagline}`}
                    </div>
                    {tier.note && (
                      <div className={`mt-1.5 text-xs font-medium ${tier.available ? "text-[#333286]" : "text-amber-600"}`} data-testid={`note-tier-${id}`}>
                        {tier.note}
                      </div>
                    )}
                  </div>

                  {/* CTA */}
                  <div className="mt-5">
                    {!tier.available ? (
                      <button
                        type="button"
                        disabled
                        className="w-full h-10 rounded-lg border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-400 cursor-default"
                        data-testid={`button-tier-${id}`}
                      >
                        Coming soon
                      </button>
                    ) : isCurrent ? (
                      <button
                        type="button"
                        disabled
                        className="w-full h-10 rounded-lg border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-500 cursor-default"
                        data-testid={`button-tier-${id}`}
                      >
                        {tier.cta.current}
                      </button>
                    ) : !loggedIn && id === "grapevine" ? (
                      <button
                        type="button"
                        onClick={() => navigate("/login")}
                        className="w-full h-10 rounded-lg bg-[#6366f1] hover:bg-[#4f46e5] text-sm font-semibold text-white shadow-sm transition-colors"
                        data-testid={`button-tier-${id}`}
                      >
                        {tier.cta.upgrade}
                      </button>
                    ) : isUpgrade ? (
                      <button
                        type="button"
                        onClick={() => startCheckout(id)}
                        className="w-full h-10 rounded-lg bg-[#6366f1] hover:bg-[#4f46e5] text-sm font-semibold text-white shadow-sm transition-colors"
                        data-testid={`button-tier-${id}`}
                      >
                        {tier.cta.upgrade}
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled
                        className="w-full h-10 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-400 cursor-default"
                        data-testid={`button-tier-${id}`}
                      >
                        Included
                      </button>
                    )}
                  </div>

                  {/* Features */}
                  <ul className="mt-6 space-y-2.5 text-sm">
                    {prev && (
                      <li className="flex items-center gap-2 font-semibold text-slate-700">
                        <ArrowUp className="h-4 w-4 text-[#7c86ff] shrink-0" />
                        Everything in {TIERS[prev].name}
                      </li>
                    )}
                    {deltaFeaturesForTier(id).map((f) => (
                      <li key={f.key} className="flex items-start gap-2 text-slate-600">
                        <Check className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                        <span>{f.label}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>

          <ComplianceStrip />
        </div>
      </div>
    </InfoPageLayout>
  );
}
