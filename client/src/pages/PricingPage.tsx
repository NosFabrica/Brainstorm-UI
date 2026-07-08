import { Link, useLocation } from "wouter";
import { Check, ArrowUp, Zap } from "lucide-react";
import { BrainLogo } from "@/components/BrainLogo";
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
  type TierId,
} from "@/lib/plans";

export default function PricingPage() {
  const [, navigate] = useLocation();
  const { tier: currentTier } = useSubscription();
  const startCheckout = useCheckout();
  const loggedIn = hasSessionToken();

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans">
      {/* Minimal header — wordmark home link */}
      <header className="border-b border-slate-200 bg-white/70 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/" className="inline-flex items-center gap-2" data-testid="link-pricing-home">
            <BrainLogo size={22} className="text-indigo-500" />
            <span className="text-lg font-bold" style={{ fontFamily: "var(--font-display)" }}>Brainstorm</span>
          </Link>
          <Link href="/billing" className="text-sm font-semibold text-slate-500 hover:text-indigo-600 transition-colors" data-testid="link-pricing-billing">
            Manage plan
          </Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-12">
        <div className="text-center max-w-2xl mx-auto">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Own your web of trust</h1>
          <p className="mt-3 text-slate-600">
            Start free on the grapevine. Upgrade when you want fresher scores, your own data, or to protect your name — paid in sats over Lightning.
          </p>
        </div>

        <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-5" data-testid="grid-pricing-tiers">
          {TIER_ORDER.map((id) => {
            const tier = TIERS[id];
            const isCurrent = loggedIn && id === currentTier;
            const isUpgrade = tierRank(id) > tierRank(currentTier);
            const prev = previousTier(id);
            const featured = id === "guardian";
            return (
              <div
                key={id}
                className={`relative flex flex-col rounded-2xl bg-white p-6 shadow-sm border transition-shadow ${
                  isCurrent ? "border-indigo-400 ring-1 ring-indigo-400" : featured ? "border-[#7c86ff]/40" : "border-slate-200"
                }`}
                data-testid={`card-tier-${id}`}
              >
                {tier.badge && (
                  <span className="absolute -top-2.5 right-5 inline-flex items-center rounded-full bg-[#eef0ff] border border-[#c7cbff] px-2.5 py-0.5 text-[11px] font-semibold text-[#4338ca]">
                    {tier.badge}
                  </span>
                )}

                <h2 className="text-lg font-bold text-slate-900">{tier.name}</h2>

                {/* Price */}
                <div className="mt-3">
                  {tier.satsPerMonth === 0 ? (
                    <div className="text-3xl font-bold text-slate-900">Free</div>
                  ) : (
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-3xl font-bold text-slate-900 tabular-nums">{tier.satsPerMonth.toLocaleString()}</span>
                      <span className="text-sm font-semibold text-amber-600 inline-flex items-center gap-0.5"><Zap className="h-3.5 w-3.5" />sats</span>
                      <span className="text-sm text-slate-400">/ mo</span>
                    </div>
                  )}
                  <div className="mt-1 text-xs text-slate-400">
                    {tier.satsPerMonth === 0 ? tier.tagline : `${tier.usdApprox} — ${tier.tagline}`}
                  </div>
                </div>

                {/* CTA */}
                <div className="mt-5">
                  {isCurrent ? (
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
                      <ArrowUp className="h-4 w-4 text-indigo-500 shrink-0" />
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
      </main>
    </div>
  );
}
