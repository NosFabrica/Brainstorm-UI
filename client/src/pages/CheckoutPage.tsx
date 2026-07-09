import { Link, useSearch, Redirect } from "wouter";
import { ArrowLeft, ShieldCheck, Repeat } from "lucide-react";
import { FlashIcon } from "@/components/FlashIcon";
import { BrainLogo } from "@/components/BrainLogo";
import { ComplianceStrip } from "@/components/ComplianceStrip";
import { env } from "@/lib/runtimeEnv";
import { TIERS, TIER_ORDER, type TierId } from "@/lib/plans";

/**
 * In-app checkout preview. When a real Flash hosted-checkout URL is configured,
 * `startCheckout` redirects off-site and users never reach this page — so landing
 * here means the Flash rail isn't wired yet. We show what the user is subscribing
 * to and keep the Subscribe action disabled ("connecting") rather than faking a
 * charge. Auth-gated via RequireAuth (needs a pubkey for the Flash handoff).
 */
export default function CheckoutPage() {
  const params = new URLSearchParams(useSearch());
  const tierId = params.get("tier") as TierId | null;

  if (!tierId || !TIER_ORDER.includes(tierId) || tierId === "grapevine") {
    return <Redirect to="/pricing" />;
  }
  const tier = TIERS[tierId];
  const flashConfigured = !!env.VITE_FLASH_CHECKOUT_URL;

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans">
      <header className="border-b border-slate-200 bg-white/70 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center">
          <Link href="/pricing" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-indigo-600" data-testid="link-checkout-back">
            <ArrowLeft className="h-4 w-4" /> Back to plans
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-10">
        <div className="flex items-center gap-2">
          <BrainLogo size={20} className="text-indigo-500" />
          <h1 className="text-2xl font-bold">Subscribe to {tier.name}</h1>
        </div>

        {/* Order summary */}
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" data-testid="checkout-summary">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-900">{tier.name}</div>
              <div className="text-xs text-slate-400">{tier.tagline}</div>
            </div>
            <div className="text-right">
              <div className="inline-flex items-baseline gap-1 text-xl font-bold text-slate-900 tabular-nums">
                {tier.satsPerMonth.toLocaleString()}
                <span className="text-xs font-semibold text-amber-600 inline-flex items-center gap-0.5"><FlashIcon className="h-3 w-3" />sats</span>
                <span className="text-xs font-normal text-slate-400">/ mo</span>
              </div>
              <div className="text-xs text-slate-400">{tier.usdApprox}</div>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
            <Repeat className="h-3.5 w-3.5 text-indigo-500" />
            Recurring monthly over Lightning via PayWithFlash. Cancel anytime in Settings → Billing.
          </div>
        </div>

        {/* Payment */}
        <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <ShieldCheck className="h-4 w-4 text-emerald-500" /> Pay with Bitcoin · Lightning
          </div>
          <p className="mt-2 text-sm text-slate-500">
            {flashConfigured
              ? "Redirecting you to secure Lightning checkout…"
              : "Lightning checkout via PayWithFlash is being connected. Card payments are coming soon."}
          </p>
          <button
            type="button"
            disabled
            className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#6366f1] px-4 py-2.5 text-sm font-semibold text-white opacity-60 cursor-not-allowed"
            data-testid="button-checkout-subscribe"
          >
            <FlashIcon className="h-4 w-4" /> Subscribe — {tier.satsPerMonth.toLocaleString()} sats/mo
          </button>
          <p className="mt-2 text-center text-[11px] text-slate-400">Payment integration coming soon — no charge will be made.</p>
        </div>

        <ComplianceStrip />
      </main>
    </div>
  );
}
