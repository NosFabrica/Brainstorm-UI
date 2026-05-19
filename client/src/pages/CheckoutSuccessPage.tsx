import { useEffect, useState } from "react";
import { useLocation, Link } from "wouter";
import { CheckCircle2, ArrowRight, Receipt, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getCurrentUser, type NostrUser } from "@/services/nostr";
import PageBackground from "@/components/PageBackground";
import { Footer } from "@/components/Footer";
import { CommerceNav } from "@/components/CommerceNav";
import { ComplianceStrip } from "@/components/ComplianceStrip";

export default function CheckoutSuccessPage() {
  const [, navigate] = useLocation();
  const [user, setUser] = useState<NostrUser | null>(null);
  const params = new URLSearchParams(window.location.search);
  const plan = params.get("plan") || "monthly";
  const planName = plan === "bimonthly" ? "Bi-Monthly Pulse" : "Monthly Pulse";

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
                You're all set
              </h1>
              <p className="text-slate-600 font-medium max-w-lg mx-auto" data-testid="text-success-subtitle">
                Welcome to <span className="font-bold text-[#333286]">{planName}</span>. Your trust scores will refresh automatically on the cadence for your plan.
              </p>

              <div className="mt-6 rounded-xl bg-white/80 border border-slate-200 p-4 max-w-md mx-auto text-left" data-testid="card-receipt-info">
                <div className="flex items-center gap-2 mb-2">
                  <Mail className="h-4 w-4 text-slate-500" />
                  <p className="text-sm font-bold text-slate-700">Receipt on its way</p>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  A receipt and subscription details have been sent to your billing email. You can review charges and manage your plan anytime from your Billing page.
                </p>
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
                <Link href="/billing">
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
