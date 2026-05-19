import { useEffect, useState } from "react";
import { Shield, Mail } from "lucide-react";
import { getCurrentUser, type NostrUser } from "@/services/nostr";
import PageBackground from "@/components/PageBackground";
import { Footer } from "@/components/Footer";
import { CommerceNav } from "@/components/CommerceNav";
import { ComplianceStrip } from "@/components/ComplianceStrip";

const LAST_UPDATED = "May 19, 2026";

export default function PrivacyPage() {
  const [user, setUser] = useState<NostrUser | null>(null);

  useEffect(() => {
    document.title = "Privacy Policy — Brainstorm";
    setUser(getCurrentUser());
  }, []);

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans flex flex-col relative overflow-hidden" data-testid="page-privacy">
      <PageBackground />
      <CommerceNav user={user} />

      <main className="flex-1 relative z-10">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12 w-full">
          <div className="space-y-2 mb-6" data-testid="section-privacy-header">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/70 border border-[#7c86ff]/12 shadow-sm">
              <Shield className="h-3 w-3 text-[#7c86ff]" />
              <p className="text-[9px] font-bold tracking-[0.15em] text-[#333286] uppercase">Privacy Policy</p>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900" style={{ fontFamily: "var(--font-display)" }} data-testid="text-privacy-title">
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-[#333286] via-[#7c86ff] to-[#333286] bg-[length:200%_auto] animate-gradient-x block pb-1">
                Privacy Policy
              </span>
            </h1>
            <p className="text-xs text-slate-400 font-medium" data-testid="text-privacy-updated">Last updated: {LAST_UPDATED}</p>
          </div>

          <div className="rounded-2xl bg-white/90 backdrop-blur-xl border border-[#7c86ff]/20 shadow-[0_0_15px_rgba(124,134,255,0.07)] overflow-hidden">
            <div className="h-1 w-full bg-gradient-to-r from-[#7c86ff] via-[#333286] to-[#7c86ff]" />
            <div className="p-6 sm:p-8 text-sm leading-relaxed text-slate-700 space-y-6" data-testid="text-privacy-body">
              <section>
                <p>This Privacy Policy explains how NosFabrica, LLC ("NosFabrica," "we," "us," or "our") collects, uses, and shares information when you use the Brainstorm web application and related services (the "Service"). By using the Service, you agree to the practices described in this policy. Capitalized terms not defined here have the meanings given in our <a href="/terms" className="text-[#333286] font-semibold hover:underline" data-testid="link-terms">Terms of Service</a>.</p>
              </section>

              <section>
                <h2 className="text-lg font-bold text-slate-900 mb-2" style={{ fontFamily: "var(--font-display)" }}>1. Information We Collect</h2>
                <p className="mb-2">We collect the following categories of information:</p>
                <ul className="list-disc pl-5 space-y-1.5">
                  <li><span className="font-semibold text-slate-900">Account identifier.</span> Your Nostr public key (npub / hex pubkey), used to identify your account. We obtain this from your NIP-07 browser extension when you sign in.</li>
                  <li><span className="font-semibold text-slate-900">Public Nostr data.</span> Profile metadata (kind 0), follow lists, mute lists, reports, and other public events we read from Nostr relays to compute your trust graph and scores.</li>
                  <li><span className="font-semibold text-slate-900">Computed data.</span> GrapeRank scores, Web-of-Trust graph derivatives, and trust attestations (NIP-85 events) we compute and, when authorized, publish on your behalf.</li>
                  <li><span className="font-semibold text-slate-900">Billing data (paid plans only).</span> Email address, billing address, and a payment-method token issued by our PCI-compliant payment processor. We do not store full payment-card numbers on our systems.</li>
                  <li><span className="font-semibold text-slate-900">Service usage data.</span> Server and client logs including IP address, browser type, timestamps, request paths, error traces, and basic interaction events, used for security, debugging, and product analytics.</li>
                  <li><span className="font-semibold text-slate-900">Local browser storage.</span> We store session tokens, preferences (theme, trust threshold preset, API environment), and small caches in your browser's localStorage. We do not use third-party advertising cookies.</li>
                </ul>
              </section>

              <section>
                <h2 className="text-lg font-bold text-slate-900 mb-2" style={{ fontFamily: "var(--font-display)" }}>2. What We Do Not Collect</h2>
                <p>We never collect, transmit, or store your Nostr private key (nsec). We do not store full payment-card numbers. We do not sell or rent your personal data to third parties for their marketing purposes.</p>
              </section>

              <section>
                <h2 className="text-lg font-bold text-slate-900 mb-2" style={{ fontFamily: "var(--font-display)" }}>3. How We Use Information</h2>
                <p className="mb-2">We use the information we collect to:</p>
                <ul className="list-disc pl-5 space-y-1.5">
                  <li>Authenticate your account and maintain your session;</li>
                  <li>Compute personalized GrapeRank scores and Web-of-Trust analytics;</li>
                  <li>Deliver scheduled recalculations on your plan's cadence;</li>
                  <li>Publish trust attestations (NIP-85) you explicitly authorize;</li>
                  <li>Process payments and manage subscriptions;</li>
                  <li>Send service-related communications such as receipts, security notices, and material policy changes;</li>
                  <li>Monitor, secure, debug, and improve the Service; and</li>
                  <li>Comply with legal obligations and enforce our Terms.</li>
                </ul>
              </section>

              <section>
                <h2 className="text-lg font-bold text-slate-900 mb-2" style={{ fontFamily: "var(--font-display)" }}>4. Legal Bases (EEA / UK Users)</h2>
                <p>If you are in the European Economic Area or the United Kingdom, we process your personal data on the following legal bases: (a) performance of our contract with you (to provide the Service); (b) our legitimate interests in operating, securing, and improving the Service; (c) your consent (for example, when you authorize the publication of an attestation); and (d) compliance with legal obligations.</p>
              </section>

              <section>
                <h2 className="text-lg font-bold text-slate-900 mb-2" style={{ fontFamily: "var(--font-display)" }}>5. How We Share Information</h2>
                <p className="mb-2">We share information only as follows:</p>
                <ul className="list-disc pl-5 space-y-1.5">
                  <li><span className="font-semibold text-slate-900">Service providers.</span> Vetted vendors that help us operate the Service (cloud hosting, payment processing, transactional email, error monitoring). They are bound by contractual confidentiality and data-protection obligations.</li>
                  <li><span className="font-semibold text-slate-900">Nostr relays.</span> When you authorize a publish action, the resulting event is broadcast to one or more public Nostr relays. Nostr is a public network; once published, events may be replicated and indexed beyond our control.</li>
                  <li><span className="font-semibold text-slate-900">Legal compliance.</span> When required by law, court order, or to protect rights, property, or safety.</li>
                  <li><span className="font-semibold text-slate-900">Business transfers.</span> In connection with a merger, acquisition, financing, or sale of all or part of our business, subject to standard confidentiality protections.</li>
                </ul>
              </section>

              <section>
                <h2 className="text-lg font-bold text-slate-900 mb-2" style={{ fontFamily: "var(--font-display)" }}>6. Data Retention</h2>
                <p>We retain account, billing, and log data for as long as your account is active and for a reasonable period afterward to satisfy tax, audit, security, and legal-compliance requirements. Computed trust data and caches may be regenerated or purged at any time. Data you publish to Nostr is public and outside our retention controls.</p>
              </section>

              <section>
                <h2 className="text-lg font-bold text-slate-900 mb-2" style={{ fontFamily: "var(--font-display)" }}>7. Security</h2>
                <p>We use industry-standard practices to protect your information. All communication with the Service is encrypted in transit (TLS). Authentication uses cryptographic signatures via your NIP-07 extension — passwords are never used. No system is perfectly secure; you are responsible for securing your private key and your device.</p>
              </section>

              <section>
                <h2 className="text-lg font-bold text-slate-900 mb-2" style={{ fontFamily: "var(--font-display)" }}>8. Your Rights & Choices</h2>
                <p className="mb-2">Depending on where you live, you may have rights to access, correct, port, or delete personal data we hold about you, and to object to or restrict certain processing. You can:</p>
                <ul className="list-disc pl-5 space-y-1.5">
                  <li>Cancel your paid subscription at any time from your Billing page;</li>
                  <li>Clear local Brainstorm data by clearing your browser's localStorage for our domain;</li>
                  <li>Request export or deletion of personal data we hold about you by emailing <a href="mailto:support@nosfabrica.com" className="text-[#333286] font-semibold hover:underline" data-testid="link-support-email">support@nosfabrica.com</a>.</li>
                </ul>
                <p className="mt-2">Please note: data you have published to Nostr is on a public network and cannot be deleted from relays we do not control.</p>
              </section>

              <section>
                <h2 className="text-lg font-bold text-slate-900 mb-2" style={{ fontFamily: "var(--font-display)" }}>9. International Transfers</h2>
                <p>We are based in the United States and process data in the United States and other jurisdictions where our service providers operate. If you access the Service from outside the U.S., you understand that your information will be transferred to and processed in countries that may have different data-protection laws than your country of residence.</p>
              </section>

              <section>
                <h2 className="text-lg font-bold text-slate-900 mb-2" style={{ fontFamily: "var(--font-display)" }}>10. Children</h2>
                <p>The Service is not directed to children under 13 (or under 16 in the EEA/UK). We do not knowingly collect personal information from children. If you believe a child has provided us with personal information, please contact us and we will take steps to delete it.</p>
              </section>

              <section>
                <h2 className="text-lg font-bold text-slate-900 mb-2" style={{ fontFamily: "var(--font-display)" }}>11. Changes to This Policy</h2>
                <p>We may update this Privacy Policy from time to time. When we make material changes, we will update the "Last updated" date above and, where appropriate, notify you by email or in-product notice.</p>
              </section>

              <section>
                <h2 className="text-lg font-bold text-slate-900 mb-2" style={{ fontFamily: "var(--font-display)" }}>12. Contact</h2>
                <p>Privacy questions or data-subject requests? Email <a href="mailto:support@nosfabrica.com" className="text-[#333286] font-semibold hover:underline" data-testid="link-contact-support-email">support@nosfabrica.com</a>.</p>
              </section>
            </div>
            <div className="border-t border-slate-100 px-6 sm:px-8 py-4 bg-slate-50/50 flex items-center gap-2 text-xs text-slate-600">
              <Mail className="h-4 w-4 text-[#7c86ff]" />
              <span>Privacy questions? <a href="mailto:support@nosfabrica.com" className="text-[#333286] font-semibold hover:underline" data-testid="link-footer-support-email">support@nosfabrica.com</a></span>
            </div>
          </div>

          <ComplianceStrip />
        </div>
      </main>

      <Footer />
    </div>
  );
}
