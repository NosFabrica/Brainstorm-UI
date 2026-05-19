import { useEffect, useState } from "react";
import { Shield, Mail, Info } from "lucide-react";
import { getCurrentUser, type NostrUser } from "@/services/nostr";
import PageBackground from "@/components/PageBackground";
import { Footer } from "@/components/Footer";
import { CommerceNav } from "@/components/CommerceNav";
import { ComplianceStrip } from "@/components/ComplianceStrip";

const LAST_UPDATED = "May 2026";

export default function PrivacyPage() {
  const [user, setUser] = useState<NostrUser | null>(null);

  useEffect(() => {
    document.title = "Privacy Policy — Brainstorm";
    setUser(getCurrentUser());
  }, []);

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans flex flex-col relative overflow-hidden" data-testid="page-privacy">
      <PageBackground />
      <CommerceNav user={user} pageTitle="Privacy" />

      <main className="flex-1 relative z-10">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12 w-full">
          <div className="space-y-2 mb-6" data-testid="section-privacy-header">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/70 border border-[#7c86ff]/12 shadow-sm">
              <Shield className="h-3 w-3 text-[#7c86ff]" />
              <p className="text-[9px] font-bold tracking-[0.15em] text-[#333286] uppercase">Privacy Policy</p>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900" style={{ fontFamily: "var(--font-display)" }} data-testid="text-privacy-title">
              Privacy Policy
            </h1>
            <p className="text-xs text-slate-400 font-medium" data-testid="text-privacy-updated">Last updated: {LAST_UPDATED}</p>
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4 mb-6 flex items-start gap-3" data-testid="banner-draft">
            <Info className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-sm text-amber-900 leading-relaxed">
              <p className="font-bold mb-1">Document being finalized</p>
              <p className="text-amber-800">Our full Privacy Policy is being finalized with legal counsel. For specific data-handling questions, please contact <a href="mailto:support@nosfabrica.com" className="font-semibold underline" data-testid="link-banner-support-email">support@nosfabrica.com</a>. The summary below describes our intended practices.</p>
            </div>
          </div>

          <div className="rounded-2xl bg-white/90 backdrop-blur-xl border border-[#7c86ff]/20 shadow-[0_0_15px_rgba(124,134,255,0.07)] overflow-hidden">
            <div className="h-1 w-full bg-gradient-to-r from-[#7c86ff] via-[#333286] to-[#7c86ff]" />
            <div className="p-6 sm:p-8 text-sm leading-relaxed text-slate-700 space-y-6" data-testid="text-privacy-body">
              <section>
                <h2 className="text-lg font-bold text-slate-900 mb-2" style={{ fontFamily: "var(--font-display)" }}>What we collect</h2>
                <p>Brainstorm collects: your Nostr public key (used to identify your account), publicly-available data from Nostr relays about your social graph, and — if you subscribe to a paid plan — billing-related information (email, payment-method token, billing address) handled by our PCI-compliant payment processor.</p>
              </section>
              <section>
                <h2 className="text-lg font-bold text-slate-900 mb-2" style={{ fontFamily: "var(--font-display)" }}>What we do not collect</h2>
                <p>We do not collect or store your Nostr private key. We do not store your card number — only a token from our payment processor. We do not sell your data to third parties.</p>
              </section>
              <section>
                <h2 className="text-lg font-bold text-slate-900 mb-2" style={{ fontFamily: "var(--font-display)" }}>How we use it</h2>
                <p>We use the data we collect to compute your personalized trust scores, deliver scheduled recalculations on your plan's cadence, publish trust attestations you authorize, send service-related emails (receipts, security notices), and improve the product.</p>
              </section>
              <section>
                <h2 className="text-lg font-bold text-slate-900 mb-2" style={{ fontFamily: "var(--font-display)" }}>Third parties</h2>
                <p>Payment processing is handled by a PCI-compliant third-party provider. We use standard transactional email and infrastructure providers. Nostr relays are independent public networks; data you publish to Nostr is public by design.</p>
              </section>
              <section>
                <h2 className="text-lg font-bold text-slate-900 mb-2" style={{ fontFamily: "var(--font-display)" }}>Your choices</h2>
                <p>You can cancel your subscription at any time from your Billing page. You can request export or deletion of personal data we hold about you by emailing <a href="mailto:support@nosfabrica.com" className="text-[#333286] font-semibold hover:underline" data-testid="link-support-email">support@nosfabrica.com</a>. Note: data you've published to Nostr is on a public network and cannot be deleted from relays we don't control.</p>
              </section>
              <section>
                <h2 className="text-lg font-bold text-slate-900 mb-2" style={{ fontFamily: "var(--font-display)" }}>Security</h2>
                <p>We use industry-standard practices to protect your data. All communication with Brainstorm is encrypted in transit (TLS). Authentication uses cryptographic signatures via your NIP-07 extension — passwords are never used.</p>
              </section>
              <section>
                <h2 className="text-lg font-bold text-slate-900 mb-2" style={{ fontFamily: "var(--font-display)" }}>Changes</h2>
                <p>We may update this policy over time. Material changes will be announced via email and posted here with an updated revision date.</p>
              </section>
              <section>
                <h2 className="text-lg font-bold text-slate-900 mb-2" style={{ fontFamily: "var(--font-display)" }}>Contact</h2>
                <p>Privacy questions or data requests? Email <a href="mailto:support@nosfabrica.com" className="text-[#333286] font-semibold hover:underline" data-testid="link-support-email">support@nosfabrica.com</a>.</p>
              </section>
            </div>
            <div className="border-t border-slate-100 px-6 sm:px-8 py-4 bg-slate-50/50 flex items-center gap-2 text-xs text-slate-600">
              <Mail className="h-4 w-4 text-[#7c86ff]" />
              <span>Privacy questions? <a href="mailto:support@nosfabrica.com" className="text-[#333286] font-semibold hover:underline" data-testid="link-support-email">support@nosfabrica.com</a></span>
            </div>
          </div>

          <ComplianceStrip />
        </div>
      </main>

      <Footer />
    </div>
  );
}
