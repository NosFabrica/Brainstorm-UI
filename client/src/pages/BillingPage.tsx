import { useEffect, useState } from "react";
import { useLocation, Link } from "wouter";
import { Receipt, Sparkles, AlertTriangle, Download, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getCurrentUser, type NostrUser } from "@/services/nostr";
import { isAuthRedirecting } from "@/services/api";
import PageBackground from "@/components/PageBackground";
import { Footer } from "@/components/Footer";
import { CommerceNav } from "@/components/CommerceNav";
import { ComplianceStrip } from "@/components/ComplianceStrip";

export default function BillingPage() {
  const [, navigate] = useLocation();
  const [user, setUser] = useState<NostrUser | null>(null);

  useEffect(() => {
    document.title = "Billing — Brainstorm";
    setUser(getCurrentUser());
  }, []);

  if (isAuthRedirecting()) return null;

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans flex flex-col relative overflow-hidden" data-testid="page-billing">
      <PageBackground />
      <CommerceNav user={user} />

      <main className="flex-1 relative z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-10 w-full">
          <div className="space-y-2 mb-6" data-testid="section-billing-header">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/70 border border-[#7c86ff]/12 shadow-sm">
              <div className="w-1 h-1 rounded-full bg-[#7c86ff] shadow-[0_0_4px_#7c86ff]" />
              <p className="text-[9px] font-bold tracking-[0.15em] text-[#333286] uppercase">Billing</p>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900" style={{ fontFamily: "var(--font-display)" }} data-testid="text-billing-title">
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-[#333286] via-[#7c86ff] to-[#333286] bg-[length:200%_auto] animate-gradient-x block pb-1">
                Subscription & receipts
              </span>
            </h1>
            <p className="text-slate-600 font-medium" data-testid="text-billing-subtitle">
              Manage your plan, payment method, and download past receipts.
            </p>
          </div>

          <div className="space-y-6">
            <div className="rounded-2xl bg-gradient-to-br from-white/95 via-white/80 to-indigo-50/40 backdrop-blur-xl border border-[#7c86ff]/20 shadow-[0_0_15px_rgba(124,134,255,0.07)] overflow-hidden" data-testid="card-current-plan">
              <div className="h-1 w-full bg-gradient-to-r from-[#7c86ff] via-[#333286] to-[#7c86ff]" />
              <div className="bg-gradient-to-b from-[#7c86ff]/10 to-white/60 border-b border-[#7c86ff]/10 px-5 py-4">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-xl bg-white border border-slate-100 shadow-sm ring-1 ring-slate-100 flex items-center justify-center">
                    <Sparkles className="h-4 w-4 text-[#333286]" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-900 tracking-tight" style={{ fontFamily: "var(--font-display)" }}>Current plan</h2>
                    <p className="text-xs text-slate-500">Your active subscription</p>
                  </div>
                </div>
              </div>
              <div className="p-5">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-2xl font-bold text-slate-900" style={{ fontFamily: "var(--font-display)" }} data-testid="text-current-tier-name">
                        Observer
                      </p>
                      <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-slate-100 text-slate-600" data-testid="badge-current-tier">
                        Free
                      </span>
                    </div>
                    <p className="text-sm text-slate-500" data-testid="text-current-tier-cadence">Manual recalculation, up to 1× per month</p>
                  </div>
                  <Button
                    className="bg-gradient-to-r from-[#333286] to-[#7c86ff] text-white font-semibold shadow-sm"
                    onClick={() => navigate("/pricing")}
                    data-testid="button-upgrade-plan"
                  >
                    Upgrade plan
                  </Button>
                </div>
                <div className="mt-5 pt-4 border-t border-slate-200/70 grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                  <div data-testid="row-billing-cycle">
                    <p className="text-[11px] uppercase tracking-wide font-bold text-slate-500 mb-1">Billing cycle</p>
                    <p className="text-slate-700 font-semibold">—</p>
                  </div>
                  <div data-testid="row-next-renewal">
                    <p className="text-[11px] uppercase tracking-wide font-bold text-slate-500 mb-1">Next renewal</p>
                    <p className="text-slate-700 font-semibold">—</p>
                  </div>
                  <div data-testid="row-amount-due">
                    <p className="text-[11px] uppercase tracking-wide font-bold text-slate-500 mb-1">Amount due</p>
                    <p className="text-slate-700 font-semibold">$0.00</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl bg-gradient-to-br from-white/95 via-white/80 to-indigo-50/40 backdrop-blur-xl border border-[#7c86ff]/20 shadow-[0_0_15px_rgba(124,134,255,0.07)] overflow-hidden" data-testid="card-payment-method">
              <div className="h-1 w-full bg-gradient-to-r from-[#7c86ff] via-[#333286] to-[#7c86ff]" />
              <div className="bg-gradient-to-b from-[#7c86ff]/10 to-white/60 border-b border-[#7c86ff]/10 px-5 py-4">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-xl bg-white border border-slate-100 shadow-sm ring-1 ring-slate-100 flex items-center justify-center">
                    <CreditCard className="h-4 w-4 text-[#333286]" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-900 tracking-tight" style={{ fontFamily: "var(--font-display)" }}>Payment method</h2>
                    <p className="text-xs text-slate-500">Cards on file</p>
                  </div>
                </div>
              </div>
              <div className="p-5">
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 p-6 text-center" data-testid="state-empty-payment">
                  <p className="text-sm font-semibold text-slate-700 mb-1">No payment method on file</p>
                  <p className="text-xs text-slate-500 mb-4">Payment integration coming soon — you'll be able to add and manage cards here once we go live.</p>
                  <Button variant="outline" disabled className="border-slate-300 text-slate-400 cursor-not-allowed" data-testid="button-manage-payment" title="Payment integration coming soon">
                    Manage payment method
                  </Button>
                </div>
              </div>
            </div>

            <div className="rounded-2xl bg-gradient-to-br from-white/95 via-white/80 to-indigo-50/40 backdrop-blur-xl border border-[#7c86ff]/20 shadow-[0_0_15px_rgba(124,134,255,0.07)] overflow-hidden" data-testid="card-receipts">
              <div className="h-1 w-full bg-gradient-to-r from-[#7c86ff] via-[#333286] to-[#7c86ff]" />
              <div className="bg-gradient-to-b from-[#7c86ff]/10 to-white/60 border-b border-[#7c86ff]/10 px-5 py-4">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-xl bg-white border border-slate-100 shadow-sm ring-1 ring-slate-100 flex items-center justify-center">
                    <Receipt className="h-4 w-4 text-[#333286]" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-900 tracking-tight" style={{ fontFamily: "var(--font-display)" }}>Receipts & invoices</h2>
                    <p className="text-xs text-slate-500">Download past charges</p>
                  </div>
                </div>
              </div>
              <div className="p-5">
                <div className="rounded-xl border border-slate-200 bg-white/60 p-8 text-center" data-testid="state-empty-receipts">
                  <Download className="h-6 w-6 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-slate-700">No receipts yet</p>
                  <p className="text-xs text-slate-500 mt-1">Receipts for paid subscriptions will appear here.</p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl bg-white/80 backdrop-blur-sm border border-rose-200/60 overflow-hidden" data-testid="card-cancel-subscription">
              <div className="px-5 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="h-9 w-9 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center shrink-0">
                    <AlertTriangle className="h-4 w-4 text-rose-600" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900">Cancel subscription</p>
                    <p className="text-xs text-slate-500 mt-0.5">Available once you have an active paid plan. See our <Link href="/refund-policy" className="text-[#333286] font-semibold hover:underline" data-testid="link-cancel-refund-policy">Refund Policy</Link>.</p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  disabled
                  className="border-rose-200 text-rose-300 cursor-not-allowed"
                  data-testid="button-cancel-subscription"
                  title="Payment integration coming soon — cancel will be enabled once you're on a paid plan"
                  aria-label="Cancel subscription — disabled until payments go live"
                >
                  Cancel
                </Button>
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
