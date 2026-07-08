import { Link, useSearch } from "wouter";
import { CheckCircle2, ArrowRight, Clock } from "lucide-react";
import { BrainLogo } from "@/components/BrainLogo";
import { TIERS, TIER_ORDER, type TierId } from "@/lib/plans";

/**
 * Post-checkout landing. Activation is webhook-driven (Flash → backend), so this
 * uses a "pending confirmation" framing rather than asserting the tier is live —
 * Settings → Billing reflects the real state once the first payment settles.
 */
export default function CheckoutSuccessPage() {
  const params = new URLSearchParams(useSearch());
  const tierId = params.get("tier") as TierId | null;
  const tier = tierId && TIER_ORDER.includes(tierId) ? TIERS[tierId] : null;

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans flex flex-col items-center justify-center px-4 py-16">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm" data-testid="checkout-success">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
          <CheckCircle2 className="h-6 w-6" />
        </div>
        <h1 className="mt-4 text-xl font-bold">
          {tier ? `Thanks — you're subscribing to ${tier.name}` : "Thanks for subscribing"}
        </h1>
        <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-200 px-3 py-1 text-xs font-medium text-amber-700">
          <Clock className="h-3.5 w-3.5" /> Confirming your first payment
        </div>
        <p className="mt-3 text-sm text-slate-500">
          {tier ? tier.name : "Your plan"} unlocks as soon as your Lightning payment settles. You can
          review or cancel it anytime in Settings → Billing.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <Link
            href="/billing"
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#6366f1] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#4f46e5]"
            data-testid="link-success-billing"
          >
            Manage your plan <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50"
          >
            Go to dashboard
          </Link>
        </div>
      </div>
      <Link href="/" className="mt-6 inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-indigo-600">
        <BrainLogo size={16} className="text-indigo-400" /> Brainstorm
      </Link>
    </div>
  );
}
