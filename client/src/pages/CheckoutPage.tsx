import { useEffect, useState } from "react";
import { useLocation, Link } from "wouter";
import { Lock, ShieldCheck, ArrowLeft, CreditCard, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getCurrentUser, type NostrUser } from "@/services/nostr";
import PageBackground from "@/components/PageBackground";
import { Footer } from "@/components/Footer";
import { CommerceNav } from "@/components/CommerceNav";
import { ComplianceStrip } from "@/components/ComplianceStrip";

const PLAN_INFO: Record<string, { name: string; monthly: number; annual: number; cadence: string }> = {
  monthly: { name: "Monthly Pulse", monthly: 8, annual: 80, cadence: "1× monthly recalculation" },
  bimonthly: { name: "Bi-Monthly Pulse", monthly: 12, annual: 120, cadence: "2× monthly recalculation" },
};

export default function CheckoutPage() {
  const [, navigate] = useLocation();
  const [user, setUser] = useState<NostrUser | null>(null);
  const params = new URLSearchParams(window.location.search);
  const planKey = params.get("plan") || "monthly";
  const billing = (params.get("billing") === "annual" ? "annual" : "monthly") as "monthly" | "annual";
  const plan = PLAN_INFO[planKey] || PLAN_INFO.monthly;
  const total = billing === "annual" ? plan.annual : plan.monthly;
  const billingLabel = billing === "annual" ? "/yr" : "/mo";

  useEffect(() => {
    document.title = `Checkout — ${plan.name} — Brainstorm`;
    setUser(getCurrentUser());
  }, [plan.name]);

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans flex flex-col relative overflow-hidden" data-testid="page-checkout">
      <PageBackground />
      <CommerceNav user={user} pageTitle="Checkout" />

      <main className="flex-1 relative z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-10 w-full">
          <Link href="/pricing" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-[#333286] mb-6" data-testid="link-back-pricing">
            <ArrowLeft className="h-4 w-4" />
            Back to pricing
          </Link>

          <div className="space-y-2 mb-8" data-testid="section-checkout-header">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/70 border border-[#7c86ff]/12 shadow-sm">
              <div className="w-1 h-1 rounded-full bg-[#7c86ff] shadow-[0_0_4px_#7c86ff]" />
              <p className="text-[9px] font-bold tracking-[0.15em] text-[#333286] uppercase">Checkout</p>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900" style={{ fontFamily: "var(--font-display)" }} data-testid="text-checkout-title">
              Complete your subscription
            </h1>
            <p className="text-slate-600 font-medium" data-testid="text-checkout-subtitle">
              You're upgrading to <span className="font-bold text-[#333286]">{plan.name}</span> — {plan.cadence}.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr,400px] gap-6">
            <div className="rounded-2xl bg-gradient-to-br from-white/95 via-white/80 to-indigo-50/40 backdrop-blur-xl border border-[#7c86ff]/20 shadow-[0_0_15px_rgba(124,134,255,0.07)] overflow-hidden" data-testid="card-checkout-form">
              <div className="h-1 w-full bg-gradient-to-r from-[#7c86ff] via-[#333286] to-[#7c86ff]" />
              <div className="bg-gradient-to-b from-[#7c86ff]/10 to-white/60 border-b border-[#7c86ff]/10 px-5 py-4">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-xl bg-white border border-slate-100 shadow-sm ring-1 ring-slate-100 flex items-center justify-center">
                    <CreditCard className="h-4 w-4 text-[#333286]" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-900 tracking-tight" style={{ fontFamily: "var(--font-display)" }}>Payment details</h2>
                    <p className="text-xs text-slate-500">All fields disabled — payment processor not yet connected.</p>
                  </div>
                </div>
              </div>

              <div className="p-5 space-y-5">
                <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3 flex items-start gap-2.5" data-testid="banner-coming-soon">
                  <Info className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-bold text-amber-900">Payments coming soon</p>
                    <p className="text-xs text-amber-700 mt-0.5">This is a preview of the checkout flow. Card processing isn't live yet — no charges will be made.</p>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-700">Email</Label>
                  <Input
                    type="email"
                    placeholder="you@example.com"
                    disabled
                    className="bg-slate-50 border-slate-200 cursor-not-allowed"
                    data-testid="input-email"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-700">Cardholder name</Label>
                  <Input
                    type="text"
                    placeholder="Name on card"
                    disabled
                    className="bg-slate-50 border-slate-200 cursor-not-allowed"
                    data-testid="input-cardholder"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-700">Card number</Label>
                  <div className="relative">
                    <Input
                      type="text"
                      placeholder="1234 1234 1234 1234"
                      disabled
                      className="bg-slate-50 border-slate-200 cursor-not-allowed pr-10"
                      data-testid="input-card-number"
                    />
                    <Lock className="h-4 w-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-slate-700">Expiry</Label>
                    <Input type="text" placeholder="MM / YY" disabled className="bg-slate-50 border-slate-200 cursor-not-allowed" data-testid="input-expiry" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-slate-700">CVC</Label>
                    <Input type="text" placeholder="123" disabled className="bg-slate-50 border-slate-200 cursor-not-allowed" data-testid="input-cvc" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-700">Billing ZIP / Postal code</Label>
                  <Input type="text" placeholder="12345" disabled className="bg-slate-50 border-slate-200 cursor-not-allowed" data-testid="input-zip" />
                </div>

                <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-[11px] text-slate-500 leading-relaxed" data-testid="text-consent">
                  By subscribing you agree to our{" "}
                  <Link href="/terms" className="text-[#333286] font-semibold hover:underline" data-testid="link-consent-terms">Terms</Link>,{" "}
                  <Link href="/privacy" className="text-[#333286] font-semibold hover:underline" data-testid="link-consent-privacy">Privacy Policy</Link>, and{" "}
                  <Link href="/refund-policy" className="text-[#333286] font-semibold hover:underline" data-testid="link-consent-refund">Refund Policy</Link>.
                  Your subscription auto-renews each {billing === "annual" ? "year" : "month"}; cancel anytime from your Billing page.
                </div>

                <Button
                  className="w-full bg-gradient-to-r from-[#333286] to-[#7c86ff] text-white font-semibold shadow-sm cursor-not-allowed opacity-70"
                  disabled
                  data-testid="button-subscribe"
                  aria-label="Subscribe — payment integration coming soon"
                  title="Payment integration coming soon"
                >
                  <Lock className="h-4 w-4 mr-2" />
                  Subscribe — ${total}{billingLabel} · Payment integration coming soon
                </Button>
                <p className="text-center text-[11px] text-slate-500 font-medium" data-testid="text-subscribe-disabled">Payment integration coming soon — this button is intentionally disabled while we finalize our payment provider.</p>
              </div>
            </div>

            <div className="lg:sticky lg:top-24 space-y-4 self-start">
              <div className="rounded-2xl bg-gradient-to-br from-white/95 via-white/80 to-indigo-50/40 backdrop-blur-xl border border-[#7c86ff]/20 shadow-[0_0_15px_rgba(124,134,255,0.07)] overflow-hidden" data-testid="card-order-summary">
                <div className="h-1 w-full bg-gradient-to-r from-[#7c86ff] via-[#333286] to-[#7c86ff]" />
                <div className="bg-gradient-to-b from-[#7c86ff]/10 to-white/60 border-b border-[#7c86ff]/10 px-5 py-4">
                  <h2 className="text-sm font-bold text-slate-900 tracking-tight" style={{ fontFamily: "var(--font-display)" }}>Order summary</h2>
                </div>
                <div className="p-5 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-slate-900" data-testid="text-summary-plan">{plan.name}</p>
                      <p className="text-xs text-slate-500 mt-0.5" data-testid="text-summary-cadence">{plan.cadence}</p>
                      <p className="text-xs text-slate-400 mt-1">Billed {billing}</p>
                    </div>
                    <p className="text-sm font-bold text-slate-900 whitespace-nowrap" data-testid="text-summary-line-amount">
                      ${total}{billingLabel}
                    </p>
                  </div>
                  <div className="h-px bg-slate-200" />
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-slate-500 font-medium">Subtotal</p>
                    <p className="text-xs text-slate-700 font-semibold">${total.toFixed(2)}</p>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-slate-500 font-medium">Estimated tax</p>
                    <p className="text-xs text-slate-700 font-semibold">Calculated at processing</p>
                  </div>
                  <div className="h-px bg-slate-200" />
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold text-slate-900">Total due today</p>
                    <p className="text-xl font-bold text-[#333286]" style={{ fontFamily: "var(--font-display)" }} data-testid="text-summary-total">
                      ${total}
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl bg-emerald-50/60 border border-emerald-200/60 p-4 flex items-start gap-3" data-testid="card-trust-badge">
                <ShieldCheck className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                <div className="text-xs text-emerald-800 leading-relaxed">
                  <p className="font-bold mb-0.5">PCI-compliant processing</p>
                  <p className="text-emerald-700">Card details are tokenized by our payment provider. We never see or store your card number.</p>
                </div>
              </div>
            </div>
          </div>

          <ComplianceStrip />
        </div>
      </main>

      <Footer />
    </div>
  );
}
