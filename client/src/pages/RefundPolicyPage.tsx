import { useEffect, useState } from "react";
import { Mail, RefreshCw } from "lucide-react";
import { getCurrentUser, type NostrUser } from "@/services/nostr";
import PageBackground from "@/components/PageBackground";
import { Footer } from "@/components/Footer";
import { CommerceNav } from "@/components/CommerceNav";
import { ComplianceStrip } from "@/components/ComplianceStrip";

const LAST_UPDATED = "May 2026";

export default function RefundPolicyPage() {
  const [user, setUser] = useState<NostrUser | null>(null);

  useEffect(() => {
    document.title = "Refund Policy — Brainstorm";
    setUser(getCurrentUser());
  }, []);

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans flex flex-col relative overflow-hidden" data-testid="page-refund-policy">
      <PageBackground />
      <CommerceNav user={user} pageTitle="Refund Policy" />

      <main className="flex-1 relative z-10">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12 w-full">
          <div className="space-y-2 mb-6" data-testid="section-refund-header">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/70 border border-[#7c86ff]/12 shadow-sm">
              <RefreshCw className="h-3 w-3 text-[#7c86ff]" />
              <p className="text-[9px] font-bold tracking-[0.15em] text-[#333286] uppercase">Refund Policy</p>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900" style={{ fontFamily: "var(--font-display)" }} data-testid="text-refund-title">
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-[#333286] via-[#7c86ff] to-[#333286] bg-[length:200%_auto] animate-gradient-x block pb-1">
                Refund & cancellation policy
              </span>
            </h1>
            <p className="text-xs text-slate-400 font-medium" data-testid="text-refund-updated">Last updated: {LAST_UPDATED}</p>
          </div>

          <div className="rounded-2xl bg-white/90 backdrop-blur-xl border border-[#7c86ff]/20 shadow-[0_0_15px_rgba(124,134,255,0.07)] overflow-hidden">
            <div className="h-1 w-full bg-gradient-to-r from-[#7c86ff] via-[#333286] to-[#7c86ff]" />
            <div className="p-6 sm:p-8 prose prose-slate max-w-none text-sm leading-relaxed text-slate-700 space-y-6" data-testid="text-refund-body">
              <section>
                <h2 className="text-lg font-bold text-slate-900 mb-2" style={{ fontFamily: "var(--font-display)" }}>The short version</h2>
                <p>You can cancel any Brainstorm subscription at any time. We don't issue refunds for partial months on monthly plans, but we offer pro-rata refunds on annual plans cancelled within 30 days of purchase.</p>
              </section>

              <section>
                <h2 className="text-lg font-bold text-slate-900 mb-2" style={{ fontFamily: "var(--font-display)" }}>Cancellation</h2>
                <p>Cancel any time from your Billing page — there's no cancellation fee and no phone call required. Your subscription remains active through the end of your current billing period. Cancellation stops future renewals; it does not retroactively refund prior billing periods on monthly plans.</p>
              </section>

              <section>
                <h2 className="text-lg font-bold text-slate-900 mb-2" style={{ fontFamily: "var(--font-display)" }}>Monthly subscriptions</h2>
                <p>Cancel from your Billing page anytime. Your subscription remains active through the end of the current billing period, after which it ends and no further charges occur. Partial-month refunds are not issued.</p>
              </section>

              <section>
                <h2 className="text-lg font-bold text-slate-900 mb-2" style={{ fontFamily: "var(--font-display)" }}>Annual subscriptions</h2>
                <p>If you cancel within 30 days of your annual purchase or renewal, you'll receive a pro-rata refund for the unused portion of the term, minus any partial month already consumed. After 30 days, your annual subscription remains active through the end of the term and renews unless cancelled.</p>
              </section>

              <section>
                <h2 className="text-lg font-bold text-slate-900 mb-2" style={{ fontFamily: "var(--font-display)" }}>Service interruptions</h2>
                <p>If Brainstorm experiences an extended outage that prevents your subscription from delivering its core service (scheduled GrapeRank recalculations), we'll credit the affected period to your next bill or issue a refund at our discretion. Contact us if you experience an interruption.</p>
              </section>

              <section>
                <h2 className="text-lg font-bold text-slate-900 mb-2" style={{ fontFamily: "var(--font-display)" }}>Chargebacks & disputes</h2>
                <p>If you believe a charge is incorrect or you can't resolve a billing issue through your Billing page, please contact us before initiating a chargeback. We'll work to resolve the issue directly — usually faster than the dispute process.</p>
              </section>

              <section>
                <h2 className="text-lg font-bold text-slate-900 mb-2" style={{ fontFamily: "var(--font-display)" }}>Refund process</h2>
                <p>Email <a href="mailto:support@nosfabrica.com?subject=Refund%20Request" className="text-[#333286] font-semibold hover:underline" data-testid="link-refund-support-email">support@nosfabrica.com</a> with your account email, the charge in question, and a brief description. We respond within 2 business days, and approved refunds are returned to the original payment method within 5–10 business days depending on your card issuer.</p>
              </section>

              <section>
                <h2 className="text-lg font-bold text-slate-900 mb-2" style={{ fontFamily: "var(--font-display)" }}>Changes to this policy</h2>
                <p>We may update this policy from time to time. Material changes will be announced via email to active subscribers and posted here with an updated revision date.</p>
              </section>

              <section>
                <h2 className="text-lg font-bold text-slate-900 mb-2" style={{ fontFamily: "var(--font-display)" }}>Contact</h2>
                <p>Questions about a charge, a refund, or this policy? Email <a href="mailto:support@nosfabrica.com?subject=Billing%20Question" className="text-[#333286] font-semibold hover:underline" data-testid="link-refund-contact-email">support@nosfabrica.com</a> and we'll get back to you within 2 business days.</p>
              </section>
            </div>

            <div className="border-t border-slate-100 px-6 sm:px-8 py-4 bg-slate-50/50 flex items-center gap-2 text-xs text-slate-600">
              <Mail className="h-4 w-4 text-[#7c86ff]" />
              <span>Questions? <a href="mailto:support@nosfabrica.com" className="text-[#333286] font-semibold hover:underline" data-testid="link-refund-footer-email">support@nosfabrica.com</a></span>
            </div>
          </div>

          <ComplianceStrip />
        </div>
      </main>

      <Footer />
    </div>
  );
}
