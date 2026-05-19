import { useEffect, useState } from "react";
import { FileText, Mail, Info } from "lucide-react";
import { getCurrentUser, type NostrUser } from "@/services/nostr";
import PageBackground from "@/components/PageBackground";
import { Footer } from "@/components/Footer";
import { CommerceNav } from "@/components/CommerceNav";
import { ComplianceStrip } from "@/components/ComplianceStrip";

const LAST_UPDATED = "May 2026";

export default function TermsPage() {
  const [user, setUser] = useState<NostrUser | null>(null);

  useEffect(() => {
    document.title = "Terms of Service — Brainstorm";
    setUser(getCurrentUser());
  }, []);

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans flex flex-col relative overflow-hidden" data-testid="page-terms">
      <PageBackground />
      <CommerceNav user={user} pageTitle="Terms" />

      <main className="flex-1 relative z-10">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12 w-full">
          <div className="space-y-2 mb-6" data-testid="section-terms-header">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/70 border border-[#7c86ff]/12 shadow-sm">
              <FileText className="h-3 w-3 text-[#7c86ff]" />
              <p className="text-[9px] font-bold tracking-[0.15em] text-[#333286] uppercase">Terms of Service</p>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900" style={{ fontFamily: "var(--font-display)" }} data-testid="text-terms-title">
              Terms of Service
            </h1>
            <p className="text-xs text-slate-400 font-medium" data-testid="text-terms-updated">Last updated: {LAST_UPDATED}</p>
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4 mb-6 flex items-start gap-3" data-testid="banner-draft">
            <Info className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-sm text-amber-900 leading-relaxed">
              <p className="font-bold mb-1">Document being finalized</p>
              <p className="text-amber-800">Our full Terms of Service are being finalized with legal counsel. For specific questions about the terms governing your use of Brainstorm, please contact <a href="mailto:support@nosfabrica.com" className="font-semibold underline" data-testid="link-banner-support-email">support@nosfabrica.com</a>. The summary below describes our intended terms.</p>
            </div>
          </div>

          <div className="rounded-2xl bg-white/90 backdrop-blur-xl border border-[#7c86ff]/20 shadow-[0_0_15px_rgba(124,134,255,0.07)] overflow-hidden">
            <div className="h-1 w-full bg-gradient-to-r from-[#7c86ff] via-[#333286] to-[#7c86ff]" />
            <div className="p-6 sm:p-8 text-sm leading-relaxed text-slate-700 space-y-6" data-testid="text-terms-body">
              <section>
                <h2 className="text-lg font-bold text-slate-900 mb-2" style={{ fontFamily: "var(--font-display)" }}>1. The service</h2>
                <p>Brainstorm is a Web of Trust dashboard for the Nostr protocol, operated by NosFabrica. We provide tools to visualize and compute personalized trust scores using the GrapeRank algorithm, and to publish trust attestations (NIP-85) on your behalf when you authorize it.</p>
              </section>
              <section>
                <h2 className="text-lg font-bold text-slate-900 mb-2" style={{ fontFamily: "var(--font-display)" }}>2. Your account</h2>
                <p>Brainstorm authenticates you using your Nostr public key via a NIP-07 browser extension. You are responsible for securing your private key. We never see or store your private key.</p>
              </section>
              <section>
                <h2 className="text-lg font-bold text-slate-900 mb-2" style={{ fontFamily: "var(--font-display)" }}>3. Subscriptions & billing</h2>
                <p>Paid plans auto-renew on the cadence you select (monthly or annually) until cancelled. You can cancel anytime from your Billing page. Refunds are governed by our Refund Policy.</p>
              </section>
              <section>
                <h2 className="text-lg font-bold text-slate-900 mb-2" style={{ fontFamily: "var(--font-display)" }}>4. Acceptable use</h2>
                <p>You agree not to abuse the service, attempt to circumvent rate limits, reverse-engineer trust calculations to manipulate scores, or use Brainstorm to harass other users. We may suspend accounts that violate these terms.</p>
              </section>
              <section>
                <h2 className="text-lg font-bold text-slate-900 mb-2" style={{ fontFamily: "var(--font-display)" }}>5. The Nostr network</h2>
                <p>Brainstorm reads from and writes to public Nostr relays. We do not control Nostr relays or events, and we cannot guarantee that any specific event will reach any specific relay.</p>
              </section>
              <section>
                <h2 className="text-lg font-bold text-slate-900 mb-2" style={{ fontFamily: "var(--font-display)" }}>6. Disclaimers</h2>
                <p>Brainstorm is provided "as is." Trust scores are computed estimates and do not constitute legal, financial, or safety advice. You are responsible for your own decisions about who to follow, trust, or transact with.</p>
              </section>
              <section>
                <h2 className="text-lg font-bold text-slate-900 mb-2" style={{ fontFamily: "var(--font-display)" }}>7. Changes</h2>
                <p>We may update these terms over time. Material changes will be announced via email and posted here with an updated revision date.</p>
              </section>
              <section>
                <h2 className="text-lg font-bold text-slate-900 mb-2" style={{ fontFamily: "var(--font-display)" }}>8. Contact</h2>
                <p>Questions about these terms? Email <a href="mailto:support@nosfabrica.com" className="text-[#333286] font-semibold hover:underline" data-testid="link-support-email">support@nosfabrica.com</a>.</p>
              </section>
            </div>
            <div className="border-t border-slate-100 px-6 sm:px-8 py-4 bg-slate-50/50 flex items-center gap-2 text-xs text-slate-600">
              <Mail className="h-4 w-4 text-[#7c86ff]" />
              <span>Legal questions? <a href="mailto:support@nosfabrica.com" className="text-[#333286] font-semibold hover:underline" data-testid="link-support-email">support@nosfabrica.com</a></span>
            </div>
          </div>

          <ComplianceStrip />
        </div>
      </main>

      <Footer />
    </div>
  );
}
