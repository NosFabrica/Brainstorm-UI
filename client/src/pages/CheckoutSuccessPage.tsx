import { useEffect, useState } from "react";
import { useLocation, Link } from "wouter";
import { CheckCircle2, ArrowRight, Receipt, Mail, RefreshCw, Network, LayoutDashboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getCurrentUser, type NostrUser } from "@/services/nostr";
import PageBackground from "@/components/PageBackground";
import { Footer } from "@/components/Footer";
import { CommerceNav } from "@/components/CommerceNav";
import { ComplianceStrip } from "@/components/ComplianceStrip";
import { resolvePlan, planTotal, billingLabel } from "@/lib/plans";

export default function CheckoutSuccessPage() {
  const [, navigate] = useLocation();
  const [user, setUser] = useState<NostrUser | null>(null);
  const params = new URLSearchParams(window.location.search);
  const billing: "monthly" | "annual" = params.get("billing") === "annual" ? "annual" : "monthly";
  const plan = resolvePlan(params.get("plan"));
  const planName = plan.name;
  const cadence = plan.cadence;
  const total = planTotal(plan, billing);
  const billingLabelStr = billingLabel(billing);

  useEffect(() => {
    document.title = "Subscription confirmed — Brainstorm";
    setUser(getCurrentUser());
  }, []);

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans flex flex-col relative overflow-hidden" data-testid="page-checkout-success">
      <PageBackground />
      <CommerceNav user={user} pageTitle="Confirmed" />

      <main className="flex-1 relative z-10">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-16 w-full">
          <div className="rounded-2xl bg-gradient-to-br from-white/95 via-white/80 to-emerald-50/40 backdrop-blur-xl border border-emerald-200/60 shadow-[0_20px_40px_-12px_rgba(16,185,129,0.15)] overflow-hidden text-center" data-testid="card-success">
            <div className="h-1 w-full bg-gradient-to-r from-emerald-400 via-emerald-500 to-emerald-400" />
            <div className="px-6 sm:px-10 py-10">
              <div className="mx-auto h-16 w-16 rounded-full bg-emerald-100 border-4 border-emerald-200 flex items-center justify-center mb-5" data-testid="icon-success">
                <CheckCircle2 className="h-8 w-8 text-emerald-600" />
              </div>
              <h1 className="text-3xl font-bold text-slate-900 tracking-tight mb-2" style={{ fontFamily: "var(--font-display)" }} data-testid="text-success-title">
                Preview: you're all set
              </h1>
              <p className="text-slate-600 font-medium max-w-lg mx-auto" data-testid="text-success-subtitle">
                This is a preview of the confirmation screen for <span className="font-bold text-[#333286]">{planName}</span>. Payment integration is coming soon — no charge was made, no subscription was activated, and no receipt was sent.
              </p>

              <div className="mt-6 rounded-xl bg-white/80 border border-[#7c86ff]/20 p-5 max-w-md mx-auto text-left" data-testid="card-order-summary">
                <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#333286] mb-3">Order summary</p>
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500 font-medium">Plan</span>
                    <span className="text-slate-900 font-bold" data-testid="text-summary-plan">{planName}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500 font-medium">Cadence</span>
                    <span className="text-slate-900 font-semibold" data-testid="text-summary-cadence">{cadence}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500 font-medium">Billing</span>
                    <span className="text-slate-900 font-semibold capitalize" data-testid="text-summary-billing">{billing}</span>
                  </div>
                  <div className="h-px bg-slate-200 my-2" />
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-700 font-bold">Total</span>
                    <span className="text-base text-[#333286] font-bold" style={{ fontFamily: "var(--font-display)" }} data-testid="text-summary-total">
                      ${total}{billingLabelStr}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-xl bg-amber-50/70 border border-amber-200 p-4 max-w-md mx-auto text-left" data-testid="card-receipt-info">
                <div className="flex items-center gap-2 mb-2">
                  <Mail className="h-4 w-4 text-amber-700" />
                  <p className="text-sm font-bold text-amber-900">Receipts coming soon</p>
                </div>
                <p className="text-xs text-amber-800 leading-relaxed">
                  Once payments go live, a receipt and subscription details will be sent to your billing email and surfaced on your Billing page. Nothing has been sent yet because this is a preview.
                </p>
              </div>

              <div className="mt-6 rounded-xl bg-white/80 border border-[#7c86ff]/20 p-5 max-w-md mx-auto text-left" data-testid="card-whats-next">
                <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#333286] mb-3">What happens next</p>
                <ol className="space-y-3">
                  <li className="flex items-start gap-3" data-testid="next-step-cadence">
                    <span className="flex-shrink-0 h-6 w-6 rounded-full bg-[#7c86ff]/15 text-[#333286] text-xs font-bold flex items-center justify-center mt-0.5">1</span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
                        <RefreshCw className="h-3.5 w-3.5 text-[#333286]" />
                        Automatic recalculation
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">{cadence}. Your trust graph will refresh on schedule without manual triggers.</p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3" data-testid="next-step-network">
                    <span className="flex-shrink-0 h-6 w-6 rounded-full bg-[#7c86ff]/15 text-[#333286] text-xs font-bold flex items-center justify-center mt-0.5">2</span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
                        <Network className="h-3.5 w-3.5 text-[#333286]" />
                        Fresh insights
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">Updated GrapeRank scores and Web of Trust signals flow to your Dashboard, Network, and Profile pages.</p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3" data-testid="next-step-manage">
                    <span className="flex-shrink-0 h-6 w-6 rounded-full bg-[#7c86ff]/15 text-[#333286] text-xs font-bold flex items-center justify-center mt-0.5">3</span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
                        <LayoutDashboard className="h-3.5 w-3.5 text-[#333286]" />
                        Manage anytime
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">Review charges, update payment, or change plans from the Billing page once payments go live.</p>
                    </div>
                  </li>
                </ol>
              </div>

              <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
                <Button
                  className="bg-gradient-to-r from-[#333286] to-[#7c86ff] text-white font-semibold shadow-sm w-full sm:w-auto"
                  onClick={() => navigate("/dashboard")}
                  data-testid="button-go-dashboard"
                >
                  Go to dashboard
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
                <Link href="/billing" data-testid="link-view-billing">
                  <Button variant="outline" className="border-[#7c86ff]/30 text-[#333286] hover:bg-[#7c86ff]/8 font-semibold w-full sm:w-auto" data-testid="button-view-billing">
                    <Receipt className="h-4 w-4 mr-2" />
                    View billing
                  </Button>
                </Link>
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
